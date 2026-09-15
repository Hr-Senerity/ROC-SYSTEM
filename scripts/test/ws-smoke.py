#!/usr/bin/env python3
"""Stdlib-only WebSocket smoke check for ROC authenticated project subscriptions."""

import base64
import hashlib
import json
import os
import socket
import struct
import urllib.parse
import urllib.request


class WebSocket:
    def __init__(self, url: str):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "ws":
            raise RuntimeError("This smoke test expects a local ws:// endpoint")
        self.sock = socket.create_connection((parsed.hostname, parsed.port or 80), timeout=5)
        self.sock.settimeout(5)
        key = base64.b64encode(os.urandom(16)).decode()
        path = parsed.path or "/"
        if parsed.query:
            path += "?" + parsed.query
        request = (
            f"GET {path} HTTP/1.1\r\nHost: {parsed.netloc}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        response = b""
        while b"\r\n\r\n" not in response:
            response += self.sock.recv(4096)
        headers, self.buffer = response.split(b"\r\n\r\n", 1)
        if not headers.startswith(b"HTTP/1.1 101"):
            raise RuntimeError(f"WebSocket handshake failed: {headers.splitlines()[0]!r}")
        expected = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
        )
        if expected not in headers:
            raise RuntimeError("WebSocket accept key mismatch")

    def _read(self, size: int) -> bytes:
        while len(self.buffer) < size:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket closed unexpectedly")
            self.buffer += chunk
        value, self.buffer = self.buffer[:size], self.buffer[size:]
        return value

    def send_json(self, value: dict) -> None:
        payload = json.dumps(value, separators=(",", ":")).encode()
        mask = os.urandom(4)
        header = bytearray([0x81])
        if len(payload) < 126:
            header.append(0x80 | len(payload))
        else:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", len(payload)))
        header.extend(mask)
        header.extend(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(header)

    def receive_json(self) -> dict:
        while True:
            first, second = self._read(2)
            opcode = first & 0x0F
            length = second & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._read(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._read(8))[0]
            mask = self._read(4) if second & 0x80 else None
            payload = self._read(length)
            if mask:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 0x8:
                raise RuntimeError("WebSocket closed by server")
            if opcode == 0x9:
                continue
            if opcode == 0x1:
                return json.loads(payload.decode())

    def close(self) -> None:
        self.sock.close()


def connect_and_authenticate(ws_url: str, token: str) -> WebSocket:
    client = WebSocket(ws_url)
    assert client.receive_json()["type"] == "hello"
    client.send_json({"type": "authenticate", "token": token})
    assert client.receive_json()["type"] == "authenticated"
    return client


def report_status(api_base: str, vehicle_id: str, device_token: str) -> None:
    body = json.dumps({
        "robot_id": vehicle_id,
        "online": True,
        "cpu_usage": 42.5,
        "memory_usage": 31.25,
        "battery_level": 86,
        "localization_confidence": 97.5,
        "position": {"x": 4.5, "y": 7.25, "theta": 0.75},
        "velocity": {"linear": 0.4, "angular": 0.1},
    }).encode()
    request = urllib.request.Request(
        api_base + "/api/protocol/status",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Device " + device_token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        assert response.status == 200


def main() -> None:
    api_base = os.environ["API_BASE"].rstrip("/")
    ws_url = api_base.replace("http://", "ws://", 1) + "/ws/status"
    unauthenticated = WebSocket(ws_url)
    assert unauthenticated.receive_json()["type"] == "hello"
    report_status(api_base, os.environ["VEHICLE_ID"], os.environ["DEVICE_TOKEN"])
    unauthenticated.sock.settimeout(0.75)
    try:
        unauthenticated.receive_json()
        raise AssertionError("unauthenticated client received a vehicle event")
    except socket.timeout:
        pass
    unauthenticated.sock.settimeout(6.5)
    timeout_event = unauthenticated.receive_json()
    assert timeout_event["type"] == "error" and timeout_event["code"] == "authentication_timeout"
    unauthenticated.close()

    owner = connect_and_authenticate(ws_url, os.environ["TOKEN"])
    outsider = connect_and_authenticate(ws_url, os.environ["TOKEN_B"])
    try:
        owner.send_json({"type": "subscribe", "project_id": os.environ["PROJECT_ID"]})
        snapshot = owner.receive_json()
        assert snapshot["type"] == "snapshot"
        assert snapshot["project_id"] == os.environ["PROJECT_ID"]

        outsider.send_json({"type": "subscribe", "project_id": os.environ["PROJECT_ID"]})
        denial = outsider.receive_json()
        assert denial["type"] == "error" and denial["code"] == "forbidden"

        report_status(api_base, os.environ["VEHICLE_ID"], os.environ["DEVICE_TOKEN"])
        event = owner.receive_json()
        assert event["type"] == "vehicle_updated"
        assert event["project_id"] == os.environ["PROJECT_ID"]
        assert event["vehicle"]["id"] == os.environ["VEHICLE_ID"]
        assert event["vehicle"]["version"] == "3"
    finally:
        owner.close()
        outsider.close()
    print("PASS websocket/unauthenticated-zero-push-timeout-project-isolation-live-event")


if __name__ == "__main__":
    main()
