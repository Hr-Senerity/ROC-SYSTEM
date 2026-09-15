#include "protocols/ProtocolBridge.h"
#include "protocols/JsonSerializer.h"
#include "protocols/RocSerializer.h"

#include <drogon/drogon.h>
#include <json/json.h>

#include "db/PostgresClient.h"
#include "utils/InputValidation.h"
#include "utils/PasswordHash.h"

// ROC Protocol Bridge — HTTP API endpoints for protocol message handling
//
// Provides endpoints for receiving robot status reports and sending control
// commands through the protocol bridge. Supports both JSON and ROC binary
// protocols (Content-Type based routing).

using namespace roc::protocol;

namespace {

std::shared_ptr<ProtocolBridge> g_bridge;

drogon::HttpResponsePtr jsonResp(const Json::Value &v, int code = 200) {
  auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
  return resp;
}

Json::Value makeResp(bool ok, const std::string &msg = "") {
  Json::Value v;
  v["ok"] = ok;
  if (!msg.empty()) v["message"] = msg;
  return v;
}

std::string requestDeviceToken(const drogon::HttpRequestPtr &req) {
  const auto header = req->getHeader("Authorization");
  constexpr const char *prefix = "Device ";
  if (header.rfind(prefix, 0) != 0) return {};
  return header.substr(std::char_traits<char>::length(prefix));
}

bool deviceAuthorized(const drogon::HttpRequestPtr &req,
                      const std::string &connStr,
                      const std::string &robotId,
                      const std::string &sharedToken,
                      bool allowSharedToken) {
  if (!roc::utils::isUuid(robotId)) return false;
  const auto token = requestDeviceToken(req);
  if (token.empty()) return false;
  try {
    roc::db::PostgresClient pg(connStr);
    if (allowSharedToken && !sharedToken.empty() && token == sharedToken) {
      return !pg.queryOneParams(
          "SELECT id FROM vehicles WHERE id = $1::uuid", {robotId}).isNull();
    }
    return !pg.queryOneParams(
        "SELECT id FROM vehicles WHERE id = $1::uuid AND device_enabled = true "
        "AND device_token_hash = $2",
        {robotId, roc::utils::sha256Hex(token)}).isNull();
  } catch (const std::exception &error) {
    LOG_ERROR << "Device authorization error: " << error.what();
    return false;
  }
}

drogon::HttpResponsePtr deviceAuthError() {
  return jsonResp(makeResp(false, "Unauthorized device or vehicle"), 401);
}

}  // namespace

void registerProtocolBridge(std::shared_ptr<ProtocolBridge> bridge,
                            const std::string &connStr,
                            const std::string &deviceToken,
                            bool allowSharedToken) {
  g_bridge = std::move(bridge);

  // POST /api/protocol/status — receive robot status (JSON format)
  drogon::app().registerHandler(
      "/api/protocol/status",
      [connStr, deviceToken, allowSharedToken](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto json = req->getJsonObject();
        if (!json) {
          cb(jsonResp(makeResp(false, "Invalid JSON body"), 400));
          return;
        }

        // Convert JSON body to bytes and ingest via JSON serializer
        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        JsonSerializer serializer;
        const auto status = serializer.deserializeStatus(data);
        if (!status) {
          cb(jsonResp(makeResp(false, "Failed to parse status message"), 400));
          return;
        }
        if (!deviceAuthorized(req, connStr, status->robot_id, deviceToken,
                              allowSharedToken)) {
          cb(deviceAuthError());
          return;
        }

        if (!g_bridge->ingest(data, ProtocolType::JSON)) {
          cb(jsonResp(makeResp(false, "Failed to apply status message"), 400));
          return;
        }

        cb(jsonResp(makeResp(true, "Status accepted")));
      },
      {drogon::Post, drogon::Options});

  // POST /api/protocol/command — send control command (JSON format)
  drogon::app().registerHandler(
      "/api/protocol/command",
      [connStr, deviceToken, allowSharedToken](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto json = req->getJsonObject();
        if (!json) {
          cb(jsonResp(makeResp(false, "Invalid JSON body"), 400));
          return;
        }

        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        JsonSerializer serializer;
        auto command = serializer.deserializeCommand(data);
        if (!command) {
          cb(jsonResp(makeResp(false, "Failed to parse command message"), 400));
          return;
        }
        if (!deviceAuthorized(req, connStr, command->robot_id, deviceToken,
                              allowSharedToken)) {
          cb(deviceAuthError());
          return;
        }

        g_bridge->enqueueCommand(*command, ProtocolType::JSON);

        cb(jsonResp(makeResp(true, "Command accepted")));
      },
      {drogon::Post, drogon::Options});

  // POST /api/protocol/roc — receive ROC binary protocol messages
  drogon::app().registerHandler(
      "/api/protocol/roc",
      [connStr, deviceToken, allowSharedToken](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        RocSerializer serializer;
        const auto status = serializer.deserializeStatus(data);
        if (!status) {
          cb(jsonResp(makeResp(false, "Failed to parse ROC status message"), 400));
          return;
        }
        if (!deviceAuthorized(req, connStr, status->robot_id, deviceToken,
                              allowSharedToken)) {
          cb(deviceAuthError());
          return;
        }

        if (!g_bridge->ingest(data, ProtocolType::ROC)) {
          cb(jsonResp(makeResp(false, "Failed to apply ROC status message"), 400));
          return;
        }

        cb(jsonResp(makeResp(true, "ROC message accepted")));
      },
      {drogon::Post, drogon::Options});

  // GET /api/protocol/pending/{robot_id} — poll for queued commands
  drogon::app().registerHandler(
      "/api/protocol/pending/{robot_id}",
      [connStr, deviceToken, allowSharedToken](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb,
         const std::string &robotId) {
        if (!deviceAuthorized(req, connStr, robotId, deviceToken,
                              allowSharedToken)) {
          cb(deviceAuthError());
          return;
        }
        auto cmds = g_bridge->pollCommands(robotId);
        Json::Value resp;
        resp["ok"] = true;
        resp["robot_id"] = robotId;
        resp["commands"] = Json::arrayValue;
        for (auto &c : cmds) resp["commands"].append(c);
        cb(jsonResp(resp));
      },
      {drogon::Get, drogon::Options});

  // When a command is ingested via /api/protocol/command, also enqueue it
  // (done in g_bridge->enqueueCommand called from the command handler)

  LOG_INFO << "Protocol bridge endpoints registered";
}
