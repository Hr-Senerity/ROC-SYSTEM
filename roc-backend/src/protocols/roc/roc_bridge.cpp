#include "protocols/ProtocolBridge.h"
#include "protocols/JsonSerializer.h"
#include "protocols/RocSerializer.h"

#include <drogon/drogon.h>
#include <json/json.h>

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

}  // namespace

void registerProtocolBridge(std::shared_ptr<ProtocolBridge> bridge) {
  g_bridge = std::move(bridge);

  // POST /api/protocol/status — receive robot status (JSON format)
  drogon::app().registerHandler(
      "/api/protocol/status",
      [](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto json = req->getJsonObject();
        if (!json) {
          cb(jsonResp(makeResp(false, "Invalid JSON body"), 400));
          return;
        }

        // Convert JSON body to bytes and ingest via JSON serializer
        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        if (!g_bridge->ingest(data, ProtocolType::JSON)) {
          cb(jsonResp(makeResp(false, "Failed to parse status message"), 400));
          return;
        }

        cb(jsonResp(makeResp(true, "Status accepted")));
      },
      {drogon::Post, drogon::Options});

  // POST /api/protocol/command — send control command (JSON format)
  drogon::app().registerHandler(
      "/api/protocol/command",
      [](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto json = req->getJsonObject();
        if (!json) {
          cb(jsonResp(makeResp(false, "Invalid JSON body"), 400));
          return;
        }

        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        if (!g_bridge->ingest(data, ProtocolType::JSON)) {
          cb(jsonResp(makeResp(false, "Failed to parse command message"), 400));
          return;
        }

        cb(jsonResp(makeResp(true, "Command accepted")));
      },
      {drogon::Post, drogon::Options});

  // POST /api/protocol/roc — receive ROC binary protocol messages
  drogon::app().registerHandler(
      "/api/protocol/roc",
      [](const drogon::HttpRequestPtr &req,
         std::function<void(const drogon::HttpResponsePtr &)> &&cb) {
        auto bodyView = req->getBody(); std::string body(bodyView);
        std::vector<uint8_t> data(body.begin(), body.end());

        if (!g_bridge->ingest(data, ProtocolType::ROC)) {
          cb(jsonResp(makeResp(false, "Failed to parse ROC binary message"), 400));
          return;
        }

        cb(jsonResp(makeResp(true, "ROC message accepted")));
      },
      {drogon::Post, drogon::Options});

  LOG_INFO << "Protocol bridge endpoints registered";
}
