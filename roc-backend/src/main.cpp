#include <drogon/drogon.h>

#include "config/AppConfig.h"
#include "db/PostgresClient.h"
#include "db/ConnectionPool.h"
#include "controllers/AuthController.h"
#include "controllers/AdminController.h"
#include "controllers/ProjectController.h"
#include "controllers/VehicleController.h"
#include "controllers/StatusWsController.h"
#include "protocols/ProtocolBridge.h"

// Forward declaration from protocols/roc/roc_bridge.cpp
void registerProtocolBridge(std::shared_ptr<roc::protocol::ProtocolBridge> bridge);

static drogon::HttpResponsePtr jsonResp(const Json::Value &v, int code = 200) {
  auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
  resp->addHeader("Access-Control-Allow-Origin", "*");
  resp->addHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  resp->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return resp;
}

int main() {
  using namespace drogon;

  roc::config::AppConfig cfg;
  try {
    cfg = roc::config::loadFromEnv();
  } catch (const std::exception &e) {
    LOG_ERROR << "Config error: " << e.what();
    return 1;
  }

  // JWT secret shared with middleware via global config
  // TODO: use app().getCustomConfig() when upgrading Drogon

  const auto connStr = roc::db::makeConnStr(
      cfg.db.host, cfg.db.port, cfg.db.name, cfg.db.user, cfg.db.password);

  // Initialize connection pool
  roc::db::initPool(connStr, 4);

  // Health check
  app().registerHandler(
      "/api/health",
      [](const HttpRequestPtr &, std::function<void(const HttpResponsePtr &)> &&cb) {
        Json::Value v;
        v["ok"] = true;
        v["service"] = "roc-backend";
        cb(jsonResp(v));
      },
      {Get, Options});

  // DB ping
  app().registerHandler(
      "/api/db/ping",
      [connStr](const HttpRequestPtr &, std::function<void(const HttpResponsePtr &)> &&cb) {
        Json::Value v;
        v["ok"] = false;
        try {
          roc::db::PostgresClient pg(connStr);
          pg.ping();
          v["ok"] = true;
          cb(jsonResp(v));
        } catch (const std::exception &e) {
          v["error"] = e.what();
          cb(jsonResp(v, 500));
        }
      },
      {Get, Options});

  // Register auth routes
  roc::controller::registerAuthRoutes(cfg, connStr);

  // Register admin routes
  roc::controller::registerAdminRoutes(cfg, connStr);

  // Register business routes
  roc::controller::registerProjectRoutes(cfg, connStr);
  roc::controller::registerVehicleRoutes(cfg, connStr);

  // Initialize protocol bridge with WebSocket broadcast
  auto bridge = std::make_shared<roc::protocol::ProtocolBridge>();
  bridge->onStatusReport([](const roc::protocol::RobotStatus &s) {
    LOG_INFO << "Robot status: " << s.robot_id
             << " online=" << s.online
             << " battery=" << s.battery_level
             << " pos=(" << s.position_x << "," << s.position_y << ")";

    // Broadcast to WebSocket clients
    Json::Value msg;
    msg["type"] = "status_update";
    msg["robot_id"] = s.robot_id;
    msg["online"] = s.online;
    msg["cpu"] = s.cpu_usage;
    msg["memory"] = s.memory_usage;
    msg["battery"] = s.battery_level;
    msg["localization_confidence"] = s.localization_confidence;
    msg["position_x"] = s.position_x;
    msg["position_y"] = s.position_y;
    msg["position_theta"] = s.position_theta;
    msg["velocity_linear"] = s.velocity_linear;
    msg["velocity_angular"] = s.velocity_angular;

    Json::StreamWriterBuilder w;
    w["indentation"] = "";
    roc::ws::StatusWsController::broadcast(Json::writeString(w, msg));
  });
  bridge->onControlCommand([](const roc::protocol::ControlCommand &c) {
    LOG_INFO << "Control command: " << c.robot_id << " type=" << c.command_type;
  });
  registerProtocolBridge(bridge);

  LOG_INFO << "Starting roc-backend on " << cfg.http.listenHost << ":" << cfg.http.listenPort;
  LOG_INFO << "DB target " << cfg.db.host << ":" << cfg.db.port << "/" << cfg.db.name;

  // Serve uploaded map images from document root
  app().setDocumentRoot(".");

  app().addListener(cfg.http.listenHost, static_cast<uint16_t>(cfg.http.listenPort));
  app().run();
  return 0;
}
