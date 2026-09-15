#include "controllers/StatusWsController.h"

#include <drogon/drogon.h>
#include <algorithm>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <sstream>
#include <utility>
#include <vector>

#include "db/PostgresClient.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"

namespace roc::ws {
namespace {

constexpr size_t kMaxClients = 256;
constexpr size_t kMaxMessageBytes = 16 * 1024;

constexpr const char *kVehicleColumns =
    "id, user_id, project_id, map_id, name, ip, status, cpu, memory, battery, "
    "localization_confidence, position_x, position_y, position_theta, "
    "velocity_linear, velocity_angular, delivery_path, last_heartbeat, "
    "telemetry_version::text AS version, received_at, created_at";

struct ClientSession {
  bool authenticated{false};
  std::string userId;
  std::string role;
  std::set<std::string> projectIds;
};

std::mutex g_mutex;
std::map<drogon::WebSocketConnectionPtr, ClientSession,
         std::owner_less<drogon::WebSocketConnectionPtr>> g_clients;
std::string g_jwtSecret;
std::string g_connStr;
std::vector<std::string> g_allowedOrigins;

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
               const std::string &message) {
  Json::Value response;
  response["type"] = "error";
  response["code"] = code;
  response["message"] = message;
  sendJson(connection, response);
}

bool originAllowed(const std::string &origin) {
  if (g_allowedOrigins.empty()) return true;
  return std::find(g_allowedOrigins.begin(), g_allowedOrigins.end(), origin) !=
         g_allowedOrigins.end();
}

bool authenticate(const drogon::WebSocketConnectionPtr &connection,
                  const std::string &token) {
  const auto payload = roc::utils::verifyJwt(token, g_jwtSecret);
  if (!payload || !payload->isMember("user_id")) return false;

  try {
    roc::db::PostgresClient pg(g_connStr);
    const auto user = pg.queryOneParams(
        "SELECT id, role, status FROM users WHERE id = $1::uuid",
        {(*payload)["user_id"].asString()});
    if (user.isNull() || user["status"].asString() != "active") return false;

    std::lock_guard<std::mutex> lock(g_mutex);
    auto found = g_clients.find(connection);
    if (found == g_clients.end()) return false;
    found->second.authenticated = true;
    found->second.userId = user["id"].asString();
    found->second.role = user["role"].asString();
    found->second.projectIds.clear();
    return true;
  } catch (const std::exception &error) {
    LOG_ERROR << "WebSocket authentication error: " << error.what();
    return false;
  }
}

std::optional<ClientSession> sessionFor(
    const drogon::WebSocketConnectionPtr &connection) {
  std::lock_guard<std::mutex> lock(g_mutex);
  const auto found = g_clients.find(connection);
  if (found == g_clients.end()) return std::nullopt;
  return found->second;
}

bool projectAllowed(const ClientSession &session, const std::string &projectId) {
  if (!roc::utils::isUuid(projectId)) return false;
  roc::db::PostgresClient pg(g_connStr);
  const auto user = pg.queryOneParams(
      "SELECT role, status FROM users WHERE id = $1::uuid", {session.userId});
  if (user.isNull() || user["status"].asString() != "active") return false;
  const auto project = pg.queryOneParams(
      "SELECT user_id FROM projects WHERE id = $1::uuid", {projectId});
  if (project.isNull()) return false;
  return user["role"].asString() == "super_admin" ||
         project["user_id"].asString() == session.userId;
}

void subscribe(const drogon::WebSocketConnectionPtr &connection,
               const std::string &projectId) {
  const auto session = sessionFor(connection);
  if (!session || !session->authenticated) {
    sendError(connection, "authentication_required", "Authenticate before subscribing");
    return;
  }
  if (!roc::utils::isUuid(projectId)) {
    sendError(connection, "invalid_project", "project_id must be a UUID");
    return;
  }

  try {
    if (!projectAllowed(*session, projectId)) {
      sendError(connection, "forbidden", "Project is unavailable or not authorized");
      return;
    }

    {
      std::lock_guard<std::mutex> lock(g_mutex);
      auto found = g_clients.find(connection);
      if (found == g_clients.end() || !found->second.authenticated) return;
      found->second.projectIds.insert(projectId);
    }

    roc::db::PostgresClient pg(g_connStr);
    const auto vehicles = pg.queryParams(
        std::string("SELECT ") + kVehicleColumns +
            " FROM vehicles WHERE project_id = $1::uuid ORDER BY created_at DESC",
        {projectId});

    Json::Value response;
    response["type"] = "snapshot";
    response["project_id"] = projectId;
    response["vehicles"] = vehicles;
    sendJson(connection, response);
  } catch (const std::exception &error) {
    LOG_ERROR << "WebSocket subscription error: " << error.what();
    sendError(connection, "subscription_failed", "Unable to subscribe to project");
  }
}

void unsubscribe(const drogon::WebSocketConnectionPtr &connection,
                 const std::string &projectId) {
  std::lock_guard<std::mutex> lock(g_mutex);
  auto found = g_clients.find(connection);
  if (found != g_clients.end()) found->second.projectIds.erase(projectId);
}

std::vector<drogon::WebSocketConnectionPtr> recipientsFor(
    const std::string &projectId) {
  std::vector<std::pair<drogon::WebSocketConnectionPtr, ClientSession>> candidates;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    for (const auto &[connection, session] : g_clients) {
      if (session.authenticated && session.projectIds.count(projectId) > 0) {
        candidates.emplace_back(connection, session);
      }
    }
  }

  std::vector<drogon::WebSocketConnectionPtr> recipients;
  for (const auto &[connection, session] : candidates) {
    try {
      if (projectAllowed(session, projectId)) {
        recipients.push_back(connection);
      } else {
        std::lock_guard<std::mutex> lock(g_mutex);
        const auto found = g_clients.find(connection);
        if (found != g_clients.end()) found->second.projectIds.erase(projectId);
        sendError(connection, "permission_revoked", "Project permission was revoked");
      }
    } catch (const std::exception &error) {
      LOG_ERROR << "WebSocket permission revalidation error: " << error.what();
    }
  }
  return recipients;
}

}  // namespace

void StatusWsController::configure(std::string jwtSecret,
                                   std::string connStr,
                                   std::vector<std::string> allowedOrigins) {
  std::lock_guard<std::mutex> lock(g_mutex);
  g_jwtSecret = std::move(jwtSecret);
  g_connStr = std::move(connStr);
  g_allowedOrigins = std::move(allowedOrigins);
}

void StatusWsController::handleNewConnection(
    const drogon::HttpRequestPtr &request,
    const drogon::WebSocketConnectionPtr &connection) {
  const auto origin = request->getHeader("Origin");
  if (!originAllowed(origin)) {
    sendError(connection, "origin_rejected", "WebSocket origin is not allowed");
    connection->forceClose();
    return;
  }

  {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_clients.size() >= kMaxClients) {
      sendError(connection, "capacity_reached", "Too many realtime connections");
      connection->forceClose();
      return;
    }
    g_clients.emplace(connection, ClientSession{});
  }

  Json::Value hello;
  hello["type"] = "hello";
  hello["authentication"] = "first_message";
  hello["protocol_version"] = 1;
  sendJson(connection, hello);

  drogon::app().getLoop()->runAfter(5.0, [connection]() {
    const auto session = sessionFor(connection);
    if (session && !session->authenticated) {
      sendError(connection, "authentication_timeout", "Authenticate within 5 seconds");
      connection->forceClose();
    }
  });
}

void StatusWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr &connection,
    std::string &&message,
    const drogon::WebSocketMessageType &type) {
  if (type != drogon::WebSocketMessageType::Text) {
    sendError(connection, "text_required", "Only text JSON messages are accepted");
    return;
  }
  if (message.size() > kMaxMessageBytes) {
    sendError(connection, "message_too_large", "Message exceeds the size limit");
    connection->forceClose();
    return;
  }

  Json::Value body;
  Json::CharReaderBuilder reader;
  std::string parseError;
  std::istringstream input(message);
  if (!Json::parseFromStream(reader, input, &body, &parseError) || !body.isObject()) {
    sendError(connection, "invalid_json", "Message must be a JSON object");
    return;
  }

  const auto messageType = body.get("type", "").asString();
  if (messageType == "authenticate") {
    const auto token = body.get("token", "").asString();
    if (token.empty() || !authenticate(connection, token)) {
      sendError(connection, "authentication_failed", "Token is invalid or account is disabled");
      connection->forceClose();
      return;
    }
    Json::Value response;
    response["type"] = "authenticated";
    response["protocol_version"] = 1;
    sendJson(connection, response);
    return;
  }

  const auto session = sessionFor(connection);
  if (!session || !session->authenticated) {
    sendError(connection, "authentication_required", "First message must authenticate");
    return;
  }

  if (messageType == "subscribe") {
    subscribe(connection, body.get("project_id", "").asString());
  } else if (messageType == "unsubscribe") {
    unsubscribe(connection, body.get("project_id", "").asString());
  } else if (messageType == "ping") {
    Json::Value response;
    response["type"] = "pong";
    sendJson(connection, response);
  } else {
    sendError(connection, "unsupported_message", "Unsupported realtime message type");
  }
}

void StatusWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr &connection) {
  std::lock_guard<std::mutex> lock(g_mutex);
  g_clients.erase(connection);
}

void StatusWsController::broadcastVehicle(const std::string &eventType,
                                          const Json::Value &vehicle) {
  if (!vehicle.isObject() || !vehicle.isMember("project_id") ||
      vehicle["project_id"].isNull()) return;
  const auto projectId = vehicle["project_id"].asString();
  if (projectId.empty()) return;

  Json::Value message;
  message["type"] = eventType;
  message["project_id"] = projectId;
  message["vehicle"] = vehicle;
  const auto payload = serialize(message);
  for (const auto &connection : recipientsFor(projectId)) connection->send(payload);
}

void StatusWsController::broadcastVehicleDeleted(const std::string &projectId,
                                                 const std::string &vehicleId) {
  if (projectId.empty() || vehicleId.empty()) return;
  Json::Value message;
  message["type"] = "vehicle_deleted";
  message["project_id"] = projectId;
  message["vehicle_id"] = vehicleId;
  const auto payload = serialize(message);
  for (const auto &connection : recipientsFor(projectId)) connection->send(payload);
}

}  // namespace roc::ws
