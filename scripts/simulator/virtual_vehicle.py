#!/usr/bin/env python3
"""ROC JSON Device Protocol v1 virtual vehicle.

The simulator keeps one Device-token-authenticated WebSocket connection,
publishes heartbeat/telemetry, and consumes durable map/road-network tasks via
the HTTP device endpoints. Secrets are read from a file and never logged.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import math
import os
import random
import signal
import ssl
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import aiohttp


LOG = logging.getLogger("roc.virtual_vehicle")
LIBRARY_VERSION = "python-simulator-0.2.0"
TERMINAL_TASK_STATES = {"delivered", "failed", "canceled", "expired"}
MAX_SEQUENCE = 9223372036854775807


class SimulatorError(RuntimeError):
    pass


class AuthenticationError(SimulatorError):
    pass


class TaskStopped(SimulatorError):
    def __init__(self, message: str, code: str = "request_failed"):
        super().__init__(message)
        self.code = code


class TransportUncertain(SimulatorError):
    """An HTTP operation may have committed; never invent a replacement event."""


class ReconciliationRequired(SimulatorError):
    pass


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def parse_bool(value: str, *, name: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise SimulatorError(f"{name} must be true or false")


def load_env_file(path: Path) -> None:
    if not path.is_file():
        raise SimulatorError(f"configuration file does not exist: {path}")
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SimulatorError(f"invalid configuration line {line_number}")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or not key.replace("_", "").isalnum():
            raise SimulatorError(f"invalid configuration key on line {line_number}")
        os.environ.setdefault(key, value.strip())


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SimulatorError(f"{name} is required")
    return value


def float_env(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError as error:
        raise SimulatorError(f"{name} must be a number") from error
    if not math.isfinite(value):
        raise SimulatorError(f"{name} must be finite")
    return value


def int_env(name: str, default: int, minimum: int = 0) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as error:
        raise SimulatorError(f"{name} must be an integer") from error
    if value < minimum:
        raise SimulatorError(f"{name} must be at least {minimum}")
    return value


@dataclass(frozen=True)
class Config:
    server_url: str
    ws_url: str
    token_file: Path
    state_dir: Path
    artifact_dir: Path
    library_version: str
    telemetry_interval: float
    initial_x: float
    initial_y: float
    initial_theta: float
    linear_velocity: float
    angular_velocity: float
    initial_battery: int
    tls_ca_file: Path | None
    tls_insecure: bool
    max_artifact_bytes: int

    @classmethod
    def from_environment(cls) -> "Config":
        server_url = required_env("ROC_SERVER_URL").rstrip("/")
        parsed = urlparse(server_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SimulatorError("ROC_SERVER_URL must be an http(s) URL")
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        ws_url = urlunparse((ws_scheme, parsed.netloc, "/ws/device", "", "", ""))
        token_file = Path(required_env("ROC_DEVICE_TOKEN_FILE")).expanduser()
        state_dir = Path(
            os.environ.get("ROC_STATE_DIR", "/var/lib/roc-virtual-vehicle/default")
        ).expanduser()
        artifact_dir = Path(
            os.environ.get("ROC_ARTIFACT_DIR", str(state_dir / "artifacts"))
        ).expanduser()
        library_version = os.environ.get(
            "ROC_LIBRARY_VERSION", LIBRARY_VERSION
        ).strip()
        if not library_version or len(library_version) > 64:
            raise SimulatorError("ROC_LIBRARY_VERSION must contain 1-64 characters")
        telemetry_interval = float_env("ROC_TELEMETRY_INTERVAL_SECONDS", 5.0)
        if telemetry_interval < 1.0:
            raise SimulatorError("ROC_TELEMETRY_INTERVAL_SECONDS must be at least 1")
        initial_battery = int_env("ROC_BATTERY_LEVEL", 100)
        if initial_battery > 100:
            raise SimulatorError("ROC_BATTERY_LEVEL must not exceed 100")
        ca_value = os.environ.get("ROC_TLS_CA_FILE", "").strip()
        tls_insecure = parse_bool(
            os.environ.get("ROC_TLS_INSECURE", "false"), name="ROC_TLS_INSECURE"
        )
        if tls_insecure and parsed.scheme != "https":
            raise SimulatorError("ROC_TLS_INSECURE is only valid with https")
        return cls(
            server_url=server_url,
            ws_url=ws_url,
            token_file=token_file,
            state_dir=state_dir,
            artifact_dir=artifact_dir,
            library_version=library_version,
            telemetry_interval=telemetry_interval,
            initial_x=float_env("ROC_INITIAL_X", 10.0),
            initial_y=float_env("ROC_INITIAL_Y", 10.0),
            initial_theta=float_env("ROC_INITIAL_THETA", 0.0),
            linear_velocity=float_env("ROC_LINEAR_VELOCITY", 0.3),
            angular_velocity=float_env("ROC_ANGULAR_VELOCITY", 0.05),
            initial_battery=initial_battery,
            tls_ca_file=Path(ca_value).expanduser() if ca_value else None,
            tls_insecure=tls_insecure,
            max_artifact_bytes=int_env(
                "ROC_MAX_ARTIFACT_BYTES", 50 * 1024 * 1024, minimum=1
            ),
        )

    def ssl_context(self) -> ssl.SSLContext | bool | None:
        if not self.server_url.startswith("https://"):
            return None
        if self.tls_insecure:
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            return context
        if self.tls_ca_file:
            if not self.tls_ca_file.is_file():
                raise SimulatorError(f"TLS CA file does not exist: {self.tls_ca_file}")
            return ssl.create_default_context(cafile=str(self.tls_ca_file))
        return ssl.create_default_context()


class StateStore:
    def __init__(self, config: Config):
        self.path = config.state_dir / "state.json"
        self.config = config
        self.data: dict[str, Any] = {
            "sequence": 0,
            "position": {
                "x": config.initial_x,
                "y": config.initial_y,
                "theta": config.initial_theta,
            },
            "battery": config.initial_battery,
            "tasks": {},
        }

    def load(self) -> None:
        self.config.state_dir.mkdir(parents=True, exist_ok=True)
        self.config.artifact_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(self.config.state_dir, 0o700)
        os.chmod(self.config.artifact_dir, 0o700)
        if not self.path.exists():
            self.save()
            return
        try:
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SimulatorError(f"unable to read state file: {error}") from error
        if not isinstance(loaded, dict):
            raise SimulatorError("state file root must be an object")
        self.data.update(loaded)
        self.data.setdefault("tasks", {})
        self.data.setdefault("position", {})
        self.data["position"].setdefault("x", self.config.initial_x)
        self.data["position"].setdefault("y", self.config.initial_y)
        self.data["position"].setdefault("theta", self.config.initial_theta)
        self.data.setdefault("battery", self.config.initial_battery)
        self.data.setdefault("sequence", 0)
        try:
            sequence = int(self.data["sequence"])
        except (TypeError, ValueError) as error:
            raise SimulatorError("stored device sequence is not an integer") from error
        if sequence < 0 or sequence > MAX_SEQUENCE:
            raise SimulatorError("stored device sequence is outside signed 64-bit range")
        self.data["sequence"] = sequence
        os.chmod(self.path, 0o600)

    def save(self) -> None:
        self.config.state_dir.mkdir(parents=True, exist_ok=True)
        file_descriptor, temporary_name = tempfile.mkstemp(
            prefix=".state-", suffix=".tmp", dir=self.config.state_dir
        )
        try:
            with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
                json.dump(self.data, handle, ensure_ascii=False, sort_keys=True)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_name, 0o600)
            os.replace(temporary_name, self.path)
            directory_fd = os.open(self.config.state_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass

    def sync_sequence(self, server_sequence: int) -> None:
        if server_sequence < 0 or server_sequence > MAX_SEQUENCE:
            raise SimulatorError("server hello sequence is outside signed 64-bit range")
        self.data["sequence"] = max(int(self.data.get("sequence", 0)), server_sequence)
        self.save()

    def next_sequence(self) -> int:
        current = int(self.data.get("sequence", 0))
        if current < 0 or current >= MAX_SEQUENCE:
            raise SimulatorError(
                "device sequence is exhausted; rotate the Device token and reset local state"
            )
        self.data["sequence"] = current + 1
        self.save()
        return int(self.data["sequence"])

    def task(self, task_id: str) -> dict[str, Any]:
        tasks = self.data.setdefault("tasks", {})
        task = tasks.setdefault(task_id, {"state": "offered", "event_ids": {}})
        task.setdefault("event_ids", {})
        return task

    def update_task(self, task_id: str, **values: Any) -> None:
        self.task(task_id).update(values)
        self.save()


class VirtualVehicle:
    def __init__(self, config: Config, token: str, state: StateStore):
        self.config = config
        self.token = token
        self.state = state
        self.stop_event = asyncio.Event()
        self.task_queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self.queued_task_ids: set[str] = set()
        self.session: aiohttp.ClientSession | None = None
        self.vehicle_id = ""
        self.server_heartbeat_seconds = 30
        self.auth_failed = False

    @property
    def device_headers(self) -> dict[str, str]:
        return {"Authorization": f"Device {self.token}"}

    def stop(self) -> None:
        self.stop_event.set()

    def envelope(self, message_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "protocol_version": 1,
            "message_id": str(uuid.uuid4()),
            "type": message_type,
            "sequence": str(self.state.next_sequence()),
            "timestamp": utc_timestamp(),
            "payload": payload,
        }

    async def send_heartbeat(self, websocket: aiohttp.ClientWebSocketResponse) -> None:
        await websocket.send_json(
            self.envelope("heartbeat", {"library_version": self.config.library_version})
        )

    async def send_telemetry(self, websocket: aiohttp.ClientWebSocketResponse) -> None:
        position = self.state.data["position"]
        interval = self.config.telemetry_interval
        theta = float(position["theta"])
        position["x"] = float(position["x"]) + (
            self.config.linear_velocity * math.cos(theta) * interval
        )
        position["y"] = float(position["y"]) + (
            self.config.linear_velocity * math.sin(theta) * interval
        )
        position["theta"] = math.atan2(
            math.sin(theta + self.config.angular_velocity * interval),
            math.cos(theta + self.config.angular_velocity * interval),
        )
        battery = max(0, min(100, int(self.state.data.get("battery", 100))))
        self.state.data["battery"] = battery
        self.state.save()
        payload = {
            "library_version": self.config.library_version,
            "online": True,
            "cpu_usage": round(random.uniform(18.0, 34.0), 2),
            "memory_usage": round(random.uniform(28.0, 46.0), 2),
            "battery_level": battery,
            "localization_confidence": round(random.uniform(96.0, 99.5), 2),
            "position": {
                "x": round(float(position["x"]), 6),
                "y": round(float(position["y"]), 6),
                "theta": round(float(position["theta"]), 6),
            },
            "velocity": {
                "linear": self.config.linear_velocity,
                "angular": self.config.angular_velocity,
            },
        }
        await websocket.send_json(self.envelope("telemetry", payload))

    async def heartbeat_loop(self, websocket: aiohttp.ClientWebSocketResponse) -> None:
        interval = max(0.5, self.server_heartbeat_seconds * 0.75)
        while not self.stop_event.is_set() and not websocket.closed:
            await self.send_heartbeat(websocket)
            await asyncio.sleep(interval)

    async def telemetry_loop(self, websocket: aiohttp.ClientWebSocketResponse) -> None:
        while not self.stop_event.is_set() and not websocket.closed:
            await self.send_telemetry(websocket)
            await asyncio.sleep(self.config.telemetry_interval)

    async def handle_server_message(self, message: dict[str, Any]) -> None:
        if message.get("protocol_version") != 1:
            raise SimulatorError("unsupported server protocol version")
        message_type = str(message.get("type", ""))
        payload = message.get("payload")
        if not isinstance(payload, dict):
            LOG.warning("ignored server message with invalid payload type=%s", message_type)
            return
        if message_type == "hello":
            self.vehicle_id = str(payload.get("vehicle_id", ""))
            try:
                last_sequence = int(str(payload.get("last_client_sequence", "0")))
                heartbeat = int(payload.get("heartbeat_interval_seconds", 30))
            except (TypeError, ValueError) as error:
                raise SimulatorError("server hello contains invalid sequence/heartbeat") from error
            self.state.sync_sequence(last_sequence)
            self.server_heartbeat_seconds = max(1, heartbeat)
            LOG.info(
                "device session established vehicle_id=%s next_sequence=%d",
                self.vehicle_id,
                int(self.state.data["sequence"]) + 1,
            )
            return
        if message_type == "task.available":
            task_id = str(payload.get("task_id", ""))
            try:
                uuid.UUID(task_id)
            except ValueError:
                LOG.warning("ignored task.available with invalid task_id")
                return
            task_state = str(self.state.task(task_id).get("state", ""))
            if (task_state in TERMINAL_TASK_STATES or task_state == "reconciliation_required"
                    or task_id in self.queued_task_ids):
                return
            self.state.update_task(
                task_id,
                resource_type=str(payload.get("resource_type", "")),
                resource_revision_id=str(payload.get("resource_revision_id", "")),
            )
            self.queued_task_ids.add(task_id)
            await self.task_queue.put(payload)
            LOG.info("queued deployment task task_id=%s", task_id)
            return
        if message_type == "error":
            code = str(payload.get("code", "unknown"))
            detail = str(payload.get("message", ""))
            LOG.error("device protocol error code=%s message=%s", code, detail)
            if code == "authentication_failed":
                self.auth_failed = True
            return
        if message_type != "ack":
            LOG.debug("ignored server message type=%s", message_type)

    async def receive_loop(self, websocket: aiohttp.ClientWebSocketResponse) -> None:
        async for incoming in websocket:
            if incoming.type == aiohttp.WSMsgType.TEXT:
                try:
                    message = json.loads(incoming.data)
                except json.JSONDecodeError:
                    LOG.warning("ignored non-JSON server text message")
                    continue
                if isinstance(message, dict):
                    await self.handle_server_message(message)
            elif incoming.type in {
                aiohttp.WSMsgType.CLOSE,
                aiohttp.WSMsgType.CLOSED,
                aiohttp.WSMsgType.ERROR,
            }:
                break

    async def connect_once(self) -> None:
        assert self.session is not None
        ssl_context = self.config.ssl_context()
        LOG.info("connecting device WebSocket url=%s", self.config.ws_url)
        async with self.session.ws_connect(
            self.config.ws_url,
            headers=self.device_headers,
            ssl=ssl_context,
            # The current Drogon endpoint accepts UTF-8 JSON text frames only.
            # Application heartbeat/telemetry keeps the session active, so the
            # aiohttp automatic WebSocket PING/PONG loop must remain disabled.
            # Drogon currently forwards control-frame replies to the text-only
            # application handler, which otherwise produces text_required.
            autoping=False,
            heartbeat=None,
            receive_timeout=90,
            max_msg_size=64 * 1024,
        ) as websocket:
            try:
                first = await asyncio.wait_for(websocket.receive(), timeout=10)
            except asyncio.TimeoutError as error:
                raise SimulatorError("server did not send hello within 10 seconds") from error
            if first.type != aiohttp.WSMsgType.TEXT:
                raise SimulatorError("server closed the connection before hello")
            first_message = json.loads(first.data)
            if not isinstance(first_message, dict):
                raise SimulatorError("server hello is not an object")
            await self.handle_server_message(first_message)
            if first_message.get("type") != "hello":
                if self.auth_failed:
                    raise AuthenticationError("device token was rejected")
                raise SimulatorError("first server message was not hello")

            loops = [
                asyncio.create_task(self.receive_loop(websocket)),
                asyncio.create_task(self.heartbeat_loop(websocket)),
                asyncio.create_task(self.telemetry_loop(websocket)),
                asyncio.create_task(self.stop_event.wait()),
            ]
            done, pending = await asyncio.wait(loops, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                if task.cancelled():
                    continue
                error = task.exception()
                if error:
                    raise error

    async def connection_manager(self) -> None:
        delay = 1.0
        while not self.stop_event.is_set():
            try:
                await self.connect_once()
                delay = 1.0
            except AuthenticationError:
                LOG.error("device authentication failed; stopping simulator")
                self.stop_event.set()
                return
            except asyncio.CancelledError:
                raise
            except Exception as error:  # reconnect boundary
                if self.auth_failed:
                    LOG.error("device authentication failed; stopping simulator")
                    self.stop_event.set()
                    return
                LOG.warning("device connection lost: %s", error)
            if self.stop_event.is_set():
                return
            wait_seconds = min(30.0, delay) * random.uniform(0.8, 1.2)
            LOG.info("reconnecting in %.1f seconds", wait_seconds)
            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=wait_seconds)
            except asyncio.TimeoutError:
                pass
            delay = min(30.0, delay * 2.0)

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        lease: str | None = None,
        body: dict[str, Any] | None = None,
        attempts: int = 3,
    ) -> dict[str, Any]:
        assert self.session is not None
        headers = self.device_headers.copy()
        if lease:
            headers["X-Task-Lease"] = lease
        url = f"{self.config.server_url}{path}"
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                async with self.session.request(
                    method, url, headers=headers, json=body, ssl=self.config.ssl_context()
                ) as response:
                    try:
                        payload = await response.json(content_type=None)
                    except (json.JSONDecodeError, aiohttp.ContentTypeError) as error:
                        raise TransportUncertain(
                            f"{method} {path} returned non-JSON HTTP {response.status}"
                        ) from error
                    if not isinstance(payload, dict):
                        raise TransportUncertain(f"{method} {path} returned invalid JSON")
                    code = str(payload.get("code", "request_failed"))
                    if response.status in {401, 403} and code != "invalid_lease":
                        raise AuthenticationError(
                            str(payload.get("error", payload.get("message", "unauthorized")))
                        )
                    if response.status >= 500:
                        raise aiohttp.ClientResponseError(
                            response.request_info,
                            response.history,
                            status=response.status,
                            message="server error",
                            headers=response.headers,
                        )
                    if response.status >= 400:
                        detail = str(payload.get("message", ""))
                        raise TaskStopped(f"HTTP {response.status} {code}: {detail}", code)
                    return payload
            except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                last_error = error
                if attempt >= attempts:
                    break
                await asyncio.sleep(2 ** (attempt - 1))
        raise TransportUncertain(f"{method} {path} failed after retries: {type(last_error).__name__}")

    async def replay_pending(self, task_id: str) -> bool:
        task = self.state.task(task_id)
        pending = task.get("outbox")
        if not pending:
            return False
        body, lease = pending["body"], pending["lease"]
        digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if digest != pending["digest"]:
            self.state.update_task(task_id, state="reconciliation_required")
            raise ReconciliationRequired("local status event digest mismatch")
        try:
            await self.request_json("POST", f"/api/device/tasks/{task_id}/status", lease=lease, body=body)
        except TaskStopped as error:
            # A committed event must replay. An uncommitted terminal event must
            # never be replaced with accept/new attempt after an ambiguous crash.
            if body["state"] in {"delivered", "failed"} or error.code == "event_conflict":
                self.state.update_task(task_id, state="reconciliation_required", error_code=error.code)
                raise ReconciliationRequired("pending event requires operator reconciliation") from error
            self.state.update_task(task_id, outbox=None)
            raise
        terminal = body["state"] in {"delivered", "failed"}
        self.state.update_task(task_id, state=body["state"], progress=body["progress"],
                               outbox=None, lease=None if terminal else task.get("lease"))
        return terminal

    async def report_status(
        self,
        task_id: str,
        lease: str,
        state: str,
        progress: int,
        *,
        error_code: str = "",
        error_message: str = "",
    ) -> None:
        body: dict[str, Any] = {
            "event_id": str(uuid.uuid4()),
            "state": state,
            "progress": progress,
        }
        if error_code:
            body["error_code"] = error_code[:64]
        if error_message:
            body["error_message"] = error_message[:512]
        if self.state.task(task_id).get("outbox"):
            raise ReconciliationRequired("replay the pending event before creating a new event")
        digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.state.update_task(task_id, outbox={"body": body, "lease": lease, "digest": digest})
        await self.replay_pending(task_id)

    @staticmethod
    def normalized_content_type(value: str) -> str:
        return value.split(";", 1)[0].strip().lower()

    @staticmethod
    def artifact_extension(resource_type: str, content_type: str) -> str:
        if resource_type == "road_network":
            return ".json"
        return {"image/png": ".png", "image/jpeg": ".jpg"}.get(content_type, ".bin")

    async def download_artifact(
        self, task_id: str, lease: str, manifest: dict[str, Any]
    ) -> tuple[Path, Path]:
        assert self.session is not None
        expected_size = int(manifest["byte_size"])
        expected_hash = str(manifest["sha256"])
        expected_type = self.normalized_content_type(str(manifest["content_type"]))
        if expected_size < 1 or expected_size > self.config.max_artifact_bytes:
            raise SimulatorError("manifest byte_size is outside the configured limit")
        if len(expected_hash) != 64 or any(c not in "0123456789abcdef" for c in expected_hash):
            raise SimulatorError("manifest sha256 is invalid")
        artifact_url = str(manifest.get("artifact_url", ""))
        expected_path = f"/api/device/tasks/{task_id}/artifact"
        if "id" in manifest:
            file_id = str(uuid.UUID(str(manifest["id"])))
            expected_path += "/" + file_id
        if artifact_url != expected_path:
            raise SimulatorError("manifest artifact_url is invalid")

        extension = self.artifact_extension(str(manifest["resource_type"]), expected_type)
        final_name = f"{task_id}-{manifest.get('role', 'resource')}-{expected_hash}{extension}"
        final_path = self.config.artifact_dir / final_name
        part_path = self.config.artifact_dir / f".{final_name}.{uuid.uuid4().hex}.part"
        headers = self.device_headers | {"X-Task-Lease": lease}
        digest = hashlib.sha256()
        received = 0
        try:
            async with self.session.get(
                f"{self.config.server_url}{artifact_url}",
                headers=headers,
                ssl=self.config.ssl_context(),
                timeout=aiohttp.ClientTimeout(total=300),
            ) as response:
                if response.status >= 400:
                    payload = await response.json(content_type=None)
                    code = str(payload.get("code", "request_failed"))
                    if response.status in {401, 403} and code != "invalid_lease":
                        raise AuthenticationError("artifact authorization failed")
                    raise TaskStopped(f"artifact download returned HTTP {response.status}", code)
                actual_type = self.normalized_content_type(
                    response.headers.get("Content-Type", "")
                )
                header_hash = response.headers.get("X-Content-SHA256", "").lower()
                if actual_type != expected_type:
                    raise SimulatorError(
                        f"content type mismatch expected={expected_type} actual={actual_type}"
                    )
                if header_hash != expected_hash:
                    raise SimulatorError("artifact SHA-256 response header mismatch")
                fd = os.open(part_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "wb") as output:
                    async for chunk in response.content.iter_chunked(64 * 1024):
                        received += len(chunk)
                        if received > expected_size or received > self.config.max_artifact_bytes:
                            raise SimulatorError("artifact exceeds declared size")
                        digest.update(chunk)
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
            if received != expected_size:
                raise SimulatorError(
                    f"artifact size mismatch expected={expected_size} actual={received}"
                )
            if digest.hexdigest() != expected_hash:
                raise SimulatorError("artifact SHA-256 mismatch")
            return part_path, final_path
        except (aiohttp.ClientError, asyncio.TimeoutError) as error:
            part_path.unlink(missing_ok=True)
            raise TransportUncertain("artifact transport interrupted") from error
        except Exception:
            part_path.unlink(missing_ok=True)
            raise

    @staticmethod
    def validate_road_network(network: dict[str, Any], manifest: dict[str, Any]) -> None:
        version = network.get("schema_version")
        if version not in {1, 2} or version != manifest.get("schema_version"):
            raise SimulatorError("unsupported or mismatched road schema")
        if network.get("coordinate_mode") not in {"metric", "legacy-normalized"}:
            raise SimulatorError("invalid coordinate mode")
        nodes = network.get("nodes", [])
        edges = network.get("edges", [])
        if not isinstance(nodes, list) or not isinstance(edges, list):
            raise SimulatorError("invalid road topology")
        node_by_id = {node["id"]: node for node in nodes}
        if len(node_by_id) != len(nodes) or len({edge["id"] for edge in edges}) != len(edges):
            raise SimulatorError("duplicate road ID")
        def finite(value: Any) -> bool:
            return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
        if any(not finite(node[axis]) for node in nodes for axis in ("x", "y")):
            raise SimulatorError("non-finite road coordinates")
        arcs: set[tuple[str, str]] = set()
        expected: dict[str, tuple[dict[str, Any], dict[str, Any], str, str]] = {}
        for edge in edges:
            start, end = edge["from"], edge["to"]
            direction = edge["direction"]
            if start == end or start not in node_by_id or end not in node_by_id or direction not in {"both", "forward"}:
                raise SimulatorError("invalid road edge")
            directions = [(start, end, "forward")]
            if direction == "both":
                directions.append((end, start, "reverse"))
            if version == 2:
                geometry = edge["geometry"]
                if geometry["type"] not in {"line", "cubic_bezier"}:
                    raise SimulatorError("unsupported curve")
                if geometry["type"] == "cubic_bezier" and any(
                    not finite(geometry[control][axis]) for control in ("control1", "control2") for axis in ("x", "y")
                ):
                    raise SimulatorError("invalid curve control")
            for a, b, name in directions:
                if (a, b) in arcs:
                    raise SimulatorError("duplicate directed connection")
                arcs.add((a, b))
                expected[edge["id"] + ":" + name] = (node_by_id[a], node_by_id[b], edge["id"], name)
        if version == 1:
            return
        sampling = network["sampling"]
        spacing = sampling["spacing"]
        if (sampling["algorithm"] != "uniform-parameter-v1" or sampling["precision"] != 6
                or not finite(spacing) or not 0.000001 <= spacing <= (100 if network["coordinate_mode"] == "metric" else 1)):
            raise SimulatorError("unsupported sampling profile")
        trajectories = network["trajectories"]
        if len(trajectories) != len(expected) or len({item["id"] for item in trajectories}) != len(trajectories):
            raise SimulatorError("invalid trajectory set")
        total = 0
        for item in trajectories:
            start, end, edge_id, direction = expected[item["id"]]
            if item["edge_id"] != edge_id or item["direction"] != direction:
                raise SimulatorError("trajectory identity mismatch")
            points = item["points"]
            total += len(points)
            if not 2 <= len(points) <= 10000 or total > 200000:
                raise SimulatorError("trajectory point limit exceeded")
            previous = 0.0
            for index, point in enumerate(points):
                if (point["index"] != index or any(not finite(point[key]) for key in ("x", "y", "s", "heading"))
                        or point["s"] < previous or (index == 0 and point["s"] != 0)):
                    raise SimulatorError("invalid ordered trajectory samples")
                previous = point["s"]
            if any(points[0][axis] != start[axis] or points[-1][axis] != end[axis] for axis in ("x", "y")):
                raise SimulatorError("trajectory endpoints mismatch")
            if not finite(item["length"]) or item["length"] != previous:
                raise SimulatorError("trajectory length mismatch")

    async def deliver_task(self, offer: dict[str, Any]) -> None:
        task_id = str(offer["task_id"])
        lease = ""
        parts: list[Path] = []
        progress = 0
        try:
            task = self.state.task(task_id)
            if task.get("state") == "reconciliation_required":
                return
            if await self.replay_pending(task_id):
                return
            if task.get("state") in TERMINAL_TASK_STATES:
                return
            if task.get("lease") and int(task.get("lease_expires_at", 0)) >= int(time.time()):
                lease = task["lease"]
            else:
                accepted = await self.request_json("POST", f"/api/device/tasks/{task_id}/accept")
                lease = str(accepted.get("lease_token", ""))
                if not lease:
                    raise SimulatorError("accept response did not contain a lease token")
                snapshot = accepted["task"]
                self.state.update_task(task_id, state=snapshot["state"], progress=snapshot["progress"],
                                       attempt=snapshot["attempt"], lease=lease,
                                       lease_expires_at=accepted["lease_expires_at"], event_ids={})
            progress = int(task.get("progress", 0))
            manifest_response = await self.request_json(
                "GET", f"/api/device/tasks/{task_id}/manifest", lease=lease
            )
            manifest = manifest_response.get("manifest")
            if not isinstance(manifest, dict) or str(manifest.get("task_id", "")) != task_id:
                raise SimulatorError("task manifest is missing or mismatched")
            for field in {
                "resource_type",
                "resource_revision_id",
                "content_type",
                "byte_size",
                "sha256",
                "version",
            }:
                if field not in manifest:
                    raise SimulatorError(f"task manifest is missing {field}")
            if (manifest["resource_type"] != offer.get("resource_type")
                    or manifest["resource_revision_id"] != offer.get("resource_revision_id")):
                raise SimulatorError("manifest resource differs from task offer")
            files = self.manifest_files(task_id, manifest)
            if task.get("state") != "delivering":
                progress = max(progress, 1)
                await self.report_status(task_id, lease, "downloading", progress)
            final_files = []
            for metadata in files:
                part_path, final_path = await self.download_artifact(task_id, lease, metadata)
                parts.append(part_path)
                if manifest["resource_type"] == "road_network":
                    self.validate_road_network(json.loads(part_path.read_text()), manifest)
                final_files.append((part_path, final_path))
            progress = max(progress, 90)
            await self.report_status(task_id, lease, "delivering", progress)
            for part_path, final_path in final_files:
                os.replace(part_path, final_path)
                parts.remove(part_path)
            metadata_path = self.config.artifact_dir / f"{task_id}-manifest.json"
            fd = os.open(metadata_path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w") as output:
                json.dump(manifest, output, sort_keys=True)
                output.flush()
                os.fsync(output.fileno())
            directory_fd = os.open(self.config.artifact_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            self.state.update_task(
                task_id,
                state="delivering",
                progress=progress,
                artifact_paths=[str(path) for _, path in final_files],
                manifest_path=str(metadata_path),
                sha256=str(manifest["sha256"]),
            )
            await self.report_status(task_id, lease, "delivered", 100)
            LOG.info("deployment delivered task_id=%s files=%d", task_id, len(final_files))
        except (TransportUncertain, ReconciliationRequired):
            # Preserve the original outbox and lease; the worker retries it.
            # In particular, a lost delivered response must NOT emit failed.
            raise
        except TaskStopped as error:
            LOG.warning("deployment stopped task_id=%s reason=%s", task_id, error)
            self.state.update_task(task_id, state="stopped", error_code=error.code, lease=None)
        except AuthenticationError as error:
            LOG.error("deployment authorization failed task_id=%s reason=%s", task_id, error)
            self.state.update_task(task_id, state="authentication_failed", error=str(error))
        except Exception as error:
            LOG.error("deployment failed task_id=%s reason=%s", task_id, error)
            self.state.update_task(task_id, state="failed_local", error=str(error))
            if lease and not self.state.task(task_id).get("outbox"):
                try:
                    await self.report_status(
                        task_id,
                        lease,
                        "failed",
                        progress,
                        error_code="simulator_delivery_failed",
                        error_message=str(error),
                    )
                except Exception as report_error:
                    LOG.warning(
                        "unable to report failed task task_id=%s reason=%s",
                        task_id,
                        report_error,
                    )
                    if self.state.task(task_id).get("outbox"):
                        raise TransportUncertain("failure status awaiting confirmation") from report_error
        finally:
            for part_path in parts:
                part_path.unlink(missing_ok=True)
            self.queued_task_ids.discard(task_id)

    @staticmethod
    def manifest_files(task_id: str, manifest: dict[str, Any]) -> list[dict[str, Any]]:
        resource = manifest["resource_type"]
        if resource == "road_network":
            if manifest.get("schema_version") not in {1, 2}:
                raise SimulatorError("unsupported road schema version")
            return [manifest]
        if resource != "map":
            raise SimulatorError("unsupported resource type")
        if manifest.get("package_version", 1) == 1:
            return [manifest]  # Historical single-file artifact only.
        if manifest.get("package_version") != 2 or manifest.get("package_digest_algorithm") != "roc-file-set-v1":
            raise SimulatorError("unsupported map package version/digest")
        files = manifest.get("files")
        expected_roles = {"pgm", "yaml"} if manifest.get("map_format") == "pgm-yaml" else {"image"}
        if (manifest.get("map_format") not in {"png", "jpeg", "pgm-yaml"}
                or not isinstance(files, list) or len(files) != len(expected_roles)
                or {item["role"] for item in files} != expected_roles
                or len({item["id"] for item in files}) != len(files)):
            raise SimulatorError("invalid map package file set")
        digest_body = "\n".join(item["role"] + ":" + item["sha256"] for item in sorted(files, key=lambda item: item["role"]))
        if (hashlib.sha256(digest_body.encode()).hexdigest() != manifest["sha256"]
                or sum(item["byte_size"] for item in files) != manifest["byte_size"]):
            raise SimulatorError("map package aggregate mismatch")
        if manifest.get("coordinate_mode") not in {"metric", "legacy-normalized"}:
            raise SimulatorError("invalid map coordinate mode")
        if manifest["coordinate_mode"] == "metric":
            values = [manifest["resolution"], *[manifest["origin"][key] for key in ("x", "y", "theta")]]
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in values) or values[0] <= 0:
                raise SimulatorError("invalid metric map metadata")
        return [dict(item, resource_type=resource, version=manifest["version"]) for item in files]

    async def task_worker(self) -> None:
        while True:
            offer = await self.task_queue.get()
            try:
                if offer is None:
                    return
                try:
                    await self.deliver_task(offer)
                except TransportUncertain:
                    if not self.stop_event.is_set():
                        await asyncio.sleep(1)
                        self.queued_task_ids.add(str(offer["task_id"]))
                        await self.task_queue.put(offer)
                except ReconciliationRequired:
                    LOG.error("deployment requires reconciliation task_id=%s", offer["task_id"])
            finally:
                self.task_queue.task_done()

    async def run(self) -> None:
        timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=30)
        connector = aiohttp.TCPConnector(ssl=self.config.ssl_context())
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            self.session = session
            for task_id, task in self.state.data["tasks"].items():
                if task.get("state") != "reconciliation_required" and (task.get("outbox") or task.get("lease")):
                    self.queued_task_ids.add(task_id)
                    await self.task_queue.put(dict(task, task_id=task_id))
            worker = asyncio.create_task(self.task_worker())
            manager = asyncio.create_task(self.connection_manager())
            await self.stop_event.wait()
            manager.cancel()
            await asyncio.gather(manager, return_exceptions=True)
            await self.task_queue.put(None)
            await worker


def read_token(path: Path) -> str:
    if not path.is_file():
        raise SimulatorError(f"device token file does not exist: {path}")
    token = path.read_text(encoding="utf-8").strip()
    if not token.startswith("roc_dev_") or len(token) < 24:
        raise SimulatorError("device token file does not contain a valid token")
    return token


async def async_main(config: Config) -> None:
    token = read_token(config.token_file)
    state = StateStore(config)
    state.load()
    vehicle = VirtualVehicle(config, token, state)
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signum, vehicle.stop)
        except NotImplementedError:
            pass
    await vehicle.run()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, help="KEY=VALUE configuration file")
    parser.add_argument("--check-config", action="store_true", help="validate and exit")
    arguments = parser.parse_args()
    try:
        if arguments.config:
            load_env_file(arguments.config)
        logging.basicConfig(
            level=os.environ.get("ROC_LOG_LEVEL", "INFO").upper(),
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        config = Config.from_environment()
        read_token(config.token_file)
        if arguments.check_config:
            print("configuration valid")
            return 0
        asyncio.run(async_main(config))
        return 0
    except KeyboardInterrupt:
        return 130
    except SimulatorError as error:
        LOG.error("%s", error)
        return 2
    except Exception:
        LOG.exception("virtual vehicle stopped unexpectedly")
        return 1


if __name__ == "__main__":
    sys.exit(main())
