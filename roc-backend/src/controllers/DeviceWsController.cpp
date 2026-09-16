#include "controllers/DeviceWsController.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <utility>

#include <drogon/drogon.h>
#include <json/json.h>

#include "controllers/StatusWsController.h"
#include "db/PostgresClient.h"
#include "protocols/DeviceProtocol.h"
#include "services/DeploymentService.h"
#include "services/VehicleStatusService.h"
#include "utils/PasswordHash.h"

namespace roc::ws {
namespace {

constexpr std::size_t kMaxDeviceConnections = 512;
constexpr std::size_t kMaxHeartbeatBytes = 4 * 1024;
constexpr std::size_t kMaxTelemetryBytes = 16 * 1024;
constexpr int kHeartbeatIntervalSeconds = 30;
constexpr int kIdleTimeoutSeconds = 45;

struct DeviceSession {
  std::string vehicleId;
  std::string projectId;
  std::string tokenHash;
  std::string libraryVersion;
  std::uint64_t lastClientSequence{0};
  std::chrono::steady_clock::time_point lastSeen{std::chrono::steady_clock::now()};
};

std::mutex g_mutex;
std::map<drogon::WebSocketConnectionPtr, DeviceSession,
         std::owner_less<drogon::WebSocketConnectionPtr>> g_sessions;
std::map<std::string, drogon::WebSocketConnectionPtr> g_vehicleConnections;
std::string g_connStr;
std::atomic<std::uint64_t> g_serverSequence{0};

std::uint64_t nextServerSequence() {
  return g_serverSequence.fetch_add(1, std::memory_order_relaxed) + 1;
}

std::string serialize(const Json::Value &value) {
  Json::StreamWriterBuilder writer;
  writer["indentation"] = "";
  return Json::writeString(writer, value);
}

void sendJson(const drogon::WebSocketConnectionPtr &connection,
              const Json::Value &value) {
  connection->send(serialize(value));
}

void sendError(const drogon::WebSocketConnectionPtr &connection,
               const std::string &code,
               const std::string &message,
               const std::string &messageId = "") {
  sendJson(connection, roc::protocol::makeDeviceError(
                           nextServerSequence(), code, message, messageId));
}

std::string requestDeviceToken(const drogon::HttpRequestPtr &request) {
  const auto header = request->getHeader("Authorization");
  constexpr const char *prefix = "Device ";
  if (header.rfind(prefix, 0) != 0) return {};
  const auto token = header.substr(std::char_traits<char>::length(prefix));
  if (token.size() < 16 || token.size() > 256 ||
      token.find_first_of(" \t\r\n") != std::string::npos) {
    return {};
  }
  return token;
}

std::optional<DeviceSession> authenticateDevice(
    const drogon::HttpRequestPtr &request) {
  const auto token = requestDeviceToken(request);
  if (token.empty() || g_connStr.empty()) return std::nullopt;
  const auto tokenHash = roc::utils::sha256Hex(token);

  roc::db::PostgresClient pg(g_connStr);
  const auto vehicle = pg.queryOneParams(
      "SELECT id, project_id, device_last_sequence::text AS device_last_sequence, "
      "device_library_version FROM vehicles WHERE device_enabled = true "
      "AND device_token_hash = $1",
      {tokenHash});
  if (vehicle.isNull()) return std::nullopt;

  DeviceSession session;
  session.vehicleId = vehicle["id"].asString();
  session.tokenHash = tokenHash;
  if (!vehicle["project_id"].isNull()) {
    session.projectId = vehicle["project_id"].asString();
  }
  if (!vehicle["device_library_version"].isNull()) {
    session.libraryVersion = vehicle["device_library_version"].asString();
  }
  try {
    session.lastClientSequence =
        std::stoull(vehicle["device_last_sequence"].asString());
  } catch (...) {
    return std::nullopt;
  }
  return session;
}

std::optional<DeviceSession> sessionFor(
    const drogon::WebSocketConnectionPtr &connection) {
  std::lock_guard<std::mutex> lock(g_mutex);
  const auto found = g_sessions.find(connection);
  if (found == g_sessions.end()) return std::nullopt;
  return found->second;
}

void updateSession(const drogon::WebSocketConnectionPtr &connection,
                   std::uint64_t sequence,
                   const std::string &libraryVersion) {
  std::lock_guard<std::mutex> lock(g_mutex);
  const auto found = g_sessions.find(connection);
  if (found == g_sessions.end()) return;
  found->second.lastClientSequence =
      std::max(found->second.lastClientSequence, sequence);
  found->second.lastSeen = std::chrono::steady_clock::now();
  if (!libraryVersion.empty()) found->second.libraryVersion = libraryVersion;
}

void scheduleIdleCheck(const drogon::WebSocketConnectionPtr &connection,
                       std::uint64_t observedSequence) {
  drogon::app().getLoop()->runAfter(
      static_cast<double>(kIdleTimeoutSeconds),
      [connection, observedSequence]() {
        bool stale = false;
        {
          std::lock_guard<std::mutex> lock(g_mutex);
          const auto found = g_sessions.find(connection);
          if (found == g_sessions.end()) return;
          const auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
              std::chrono::steady_clock::now() - found->second.lastSeen);
          stale = found->second.lastClientSequence == observedSequence &&
                  elapsed.count() >= kIdleTimeoutSeconds;
        }
        if (stale) {
          sendError(connection, "heartbeat_timeout",
                    "No valid device message was received before the idle timeout");
          connection->forceClose();
        }
      });
}

void broadcastVehicle(const Json::Value &vehicle) {
  if (!vehicle.isNull()) {
    StatusWsController::broadcastVehicle("vehicle_updated", vehicle);
  }
}

}  // namespace

void DeviceWsController::configure(std::string connStr) {
  std::lock_guard<std::mutex> lock(g_mutex);
  g_connStr = std::move(connStr);
}

void DeviceWsController::notifyPendingTasks(const std::string &vehicleId) {
  drogon::WebSocketConnectionPtr connection;
  std::string connStr;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    const auto found = g_vehicleConnections.find(vehicleId);
    if (found == g_vehicleConnections.end()) return;
    connection = found->second;
    connStr = g_connStr;
  }
  try {
    roc::service::DeploymentService service(connStr, "");
    for (const auto &offer : service.offerPendingTasks(vehicleId)) {
      sendJson(connection, roc::protocol::makeDeviceMessage(
                               "task.available", nextServerSequence(), offer));
    }
  } catch (const std::exception &error) {
    LOG_ERROR << "Unable to offer pending tasks to " << vehicleId << ": "
              << error.what();
  }
}
void DeviceWsController::disconnectVehicle(
    const std::string &vehicleId,
    const std::string &reason,
    const std::string &preservedTokenHash) {
  drogon::WebSocketConnectionPtr connection;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    const auto found = g_vehicleConnections.find(vehicleId);
    if (found == g_vehicleConnections.end()) return;
    const auto session = g_sessions.find(found->second);
    if (!preservedTokenHash.empty() && session != g_sessions.end() &&
        session->second.tokenHash == preservedTokenHash) {
      return;
    }
    connection = found->second;
  }
  sendError(connection, reason, "Device credential is no longer valid");
  connection->forceClose();
}

void DeviceWsController::handleNewConnection(
    const drogon::HttpRequestPtr &request,
    const drogon::WebSocketConnectionPtr &connection) {
  std::optional<DeviceSession> authenticated;
  try {
    authenticated = authenticateDevice(request);
  } catch (const std::exception &error) {
    LOG_ERROR << "Device WebSocket authentication error: " << error.what();
  }
  if (!authenticated) {
    sendError(connection, "authentication_failed",
              "Device token is invalid, revoked, or unavailable");
    connection->forceClose();
    return;
  }

  drogon::WebSocketConnectionPtr previous;
  bool capacityReached = false;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    const auto existing = g_vehicleConnections.find(authenticated->vehicleId);
    const bool replacing = existing != g_vehicleConnections.end();
    capacityReached = g_sessions.size() >= kMaxDeviceConnections && !replacing;
    if (!capacityReached) {
      if (replacing && existing->second != connection) previous = existing->second;
      g_sessions[connection] = *authenticated;
      g_vehicleConnections[authenticated->vehicleId] = connection;
    }
  }
  if (capacityReached) {
    sendError(connection, "capacity_reached", "Too many device connections");
    connection->forceClose();
    return;
  }
  if (previous) {
    sendError(previous, "connection_replaced",
              "A newer connection authenticated for this vehicle");
    previous->forceClose();
  }

  try {
    const auto connected = roc::service::VehicleStatusService::markConnected(
        g_connStr, authenticated->vehicleId, authenticated->tokenHash);
    if (!connected) {
      throw std::runtime_error("device was disabled during connection setup");
    }
    broadcastVehicle(*connected);
  } catch (const std::exception &error) {
    LOG_ERROR << "Device connection persistence failed: " << error.what();
    sendError(connection, "service_unavailable",
              "Unable to initialize the device session");
    connection->forceClose();
    return;
  }

  Json::Value payload;
  payload["vehicle_id"] = authenticated->vehicleId;
  payload["heartbeat_interval_seconds"] = kHeartbeatIntervalSeconds;
  payload["idle_timeout_seconds"] = kIdleTimeoutSeconds;
  payload["max_message_bytes"] =
      static_cast<Json::UInt64>(roc::protocol::kMaxDeviceMessageBytes);
  payload["max_heartbeat_bytes"] =
      static_cast<Json::UInt64>(kMaxHeartbeatBytes);
  payload["max_telemetry_bytes"] =
      static_cast<Json::UInt64>(kMaxTelemetryBytes);
  payload["last_client_sequence"] =
      std::to_string(authenticated->lastClientSequence);
  sendJson(connection, roc::protocol::makeDeviceMessage(
                           "hello", nextServerSequence(), payload));
  scheduleIdleCheck(connection, authenticated->lastClientSequence);
  notifyPendingTasks(authenticated->vehicleId);
}

void DeviceWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr &connection,
    std::string &&message,
    const drogon::WebSocketMessageType &type) {
  if (type != drogon::WebSocketMessageType::Text) {
    sendError(connection, "text_required",
              "Only UTF-8 JSON text messages are accepted");
    return;
  }

  const auto session = sessionFor(connection);
  if (!session) {
    sendError(connection, "authentication_required",
              "Authenticate with a Device token during the WebSocket handshake");
    connection->forceClose();
    return;
  }

  roc::protocol::DeviceProtocolError protocolError;
  const auto envelope =
      roc::protocol::parseDeviceEnvelope(message, &protocolError);
  if (!envelope) {
    sendError(connection, protocolError.code, protocolError.message);
    return;
  }

  const auto typeLimit = envelope->type == "heartbeat"
                             ? kMaxHeartbeatBytes
                             : kMaxTelemetryBytes;
  if (message.size() > typeLimit) {
    sendError(connection, "message_too_large",
              envelope->type + " exceeds its message size limit",
              envelope->messageId);
    return;
  }

  if (envelope->sequence <= session->lastClientSequence) {
    sendJson(connection, roc::protocol::makeDeviceAck(
                             nextServerSequence(), *envelope, true));
    return;
  }

  protocolError = {};
  auto libraryVersion =
      roc::protocol::optionalLibraryVersion(*envelope, &protocolError);
  if (!protocolError.code.empty()) {
    sendError(connection, protocolError.code, protocolError.message,
              envelope->messageId);
    return;
  }
  if (libraryVersion.empty()) libraryVersion = session->libraryVersion;

  roc::service::VehicleUpdateResult result;
  try {
    if (envelope->type == "heartbeat") {
      result = roc::service::VehicleStatusService::applyHeartbeat(
          g_connStr, session->vehicleId, envelope->sequence,
          roc::protocol::kDeviceProtocolVersion, libraryVersion,
          session->tokenHash);
    } else if (envelope->type == "telemetry") {
      const auto status = roc::protocol::telemetryFromEnvelope(
          *envelope, session->vehicleId, &protocolError);
      if (!status) {
        sendError(connection, protocolError.code, protocolError.message,
                  envelope->messageId);
        return;
      }
      result = roc::service::VehicleStatusService::applyTelemetry(
          g_connStr, *status, envelope->sequence,
          roc::protocol::kDeviceProtocolVersion, libraryVersion,
          session->tokenHash);
    } else {
      sendError(connection, "unsupported_message",
                "Supported device messages are heartbeat and telemetry",
                envelope->messageId);
      return;
    }
  } catch (const std::exception &error) {
    LOG_ERROR << "Device message persistence failed for " << session->vehicleId
              << ": " << error.what();
    sendError(connection, "service_unavailable",
              "Unable to persist the device message", envelope->messageId);
    return;
  }

  if (result.outcome == roc::service::VehicleUpdateOutcome::Unauthorized) {
    sendError(connection, "authentication_failed", result.error,
              envelope->messageId);
    connection->forceClose();
    return;
  }
  if (result.outcome == roc::service::VehicleUpdateOutcome::Rejected) {
    sendError(connection, "message_rejected", result.error,
              envelope->messageId);
    return;
  }

  updateSession(connection, envelope->sequence, libraryVersion);
  scheduleIdleCheck(connection, envelope->sequence);
  if (result.outcome == roc::service::VehicleUpdateOutcome::Applied) {
    broadcastVehicle(result.vehicle);
  }
  sendJson(connection, roc::protocol::makeDeviceAck(
                           nextServerSequence(), *envelope,
                           result.outcome ==
                               roc::service::VehicleUpdateOutcome::Duplicate));
}

void DeviceWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr &connection) {
  std::optional<DeviceSession> closed;
  bool currentConnection = false;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    const auto found = g_sessions.find(connection);
    if (found == g_sessions.end()) return;
    closed = found->second;
    g_sessions.erase(found);

    const auto current = g_vehicleConnections.find(closed->vehicleId);
    if (current != g_vehicleConnections.end() && current->second == connection) {
      currentConnection = true;
      g_vehicleConnections.erase(current);
    }
  }

  if (!currentConnection) return;
  try {
    broadcastVehicle(roc::service::VehicleStatusService::markDisconnected(
                         g_connStr, closed->vehicleId, closed->tokenHash)
                         .value_or(Json::Value(Json::nullValue)));
  } catch (const std::exception &error) {
    LOG_ERROR << "Device disconnect persistence failed for " << closed->vehicleId
              << ": " << error.what();
  }
}

}  // namespace roc::ws