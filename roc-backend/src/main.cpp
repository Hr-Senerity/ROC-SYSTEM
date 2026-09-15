#include <drogon/drogon.h>

#include "config/AppConfig.h"
#include "db/PostgresClient.h"
#include "controllers/AuthController.h"
#include "controllers/AdminController.h"
#include "controllers/ProjectController.h"
#include "controllers/VehicleController.h"
#include "controllers/StatusWsController.h"
#include "protocols/ProtocolBridge.h"
#include "services/VehicleStatusService.h"

// Forward declaration from protocols/roc/roc_bridge.cpp
void registerProtocolBridge(std::shared_ptr<roc::protocol::ProtocolBridge> bridge,
                            const std::string &connStr,
                            const std::string &deviceToken,
                            bool allowSharedToken);

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

  roc::ws::StatusWsController::configure(
      cfg.auth.jwtSecret, connStr, cfg.realtime.allowedOrigins);

  // Initialize protocol bridge with WebSocket broadcast
  auto bridge = std::make_shared<roc::protocol::ProtocolBridge>();
  bridge->onStatusReport([connStr](const roc::protocol::RobotStatus &s) {
    LOG_INFO << "Robot status: " << s.robot_id
             << " online=" << s.online
             << " battery=" << s.battery_level
             << " pos=(" << s.position_x << "," << s.position_y << ")";

    try {
      std::string error;
      const auto vehicle = roc::service::VehicleStatusService::applyStatus(
          connStr, s, &error);
      if (!vehicle) {
        LOG_WARN << "Rejected robot status " << s.robot_id << ": " << error;
        return false;
      }
      roc::ws::StatusWsController::broadcastVehicle("vehicle_updated", *vehicle);
      return true;
    } catch (const std::exception &error) {
      LOG_ERROR << "Status persistence failed for " << s.robot_id << ": " << error.what();
      return false;
    }
  });
  bridge->onControlCommand([](const roc::protocol::ControlCommand &c) {
    LOG_INFO << "Control command: " << c.robot_id << " type=" << c.command_type;
  });
  registerProtocolBridge(
      bridge, connStr, cfg.device.token, cfg.device.allowSharedToken);

  LOG_INFO << "Starting roc-backend on " << cfg.http.listenHost << ":" << cfg.http.listenPort;
  LOG_INFO << "DB target " << cfg.db.host << ":" << cfg.db.port << "/" << cfg.db.name;

  // Keep the generic static-file handler away from private map uploads.
  // Map bytes are served only by the authenticated project route.
  app().setDocumentRoot("./public");

  app().addListener(cfg.http.listenHost, static_cast<uint16_t>(cfg.http.listenPort));
  app().run();
  return 0;
}
