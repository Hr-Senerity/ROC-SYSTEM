#include <cstdint>
#include <functional>
#include <string>

#include <drogon/drogon.h>

#include "config/AppConfig.h"
#include "controllers/AdminController.h"
#include "controllers/AuthController.h"
#include "controllers/DeviceWsController.h"
#include "controllers/DeploymentController.h"
#include "controllers/ProjectController.h"
#include "controllers/MapArtifactController.h"
#include "controllers/RoadNetworkController.h"
#include "controllers/StatusWsController.h"
#include "controllers/VehicleController.h"
#include "db/PostgresClient.h"

static drogon::HttpResponsePtr jsonResp(const Json::Value &value,
                                        int code = 200) {
  auto response = drogon::HttpResponse::newHttpJsonResponse(value);
  response->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
  response->addHeader("Access-Control-Allow-Origin", "*");
  response->addHeader("Access-Control-Allow-Methods",
                      "GET, POST, PATCH, DELETE, OPTIONS");
  response->addHeader("Access-Control-Allow-Headers",
                      "Content-Type, Authorization");
  return response;
}

int main() {
  using namespace drogon;

  roc::config::AppConfig config;
  try {
    config = roc::config::loadFromEnv();
  } catch (const std::exception &error) {
    LOG_ERROR << "Config error: " << error.what();
    return 1;
  }

  const auto connStr = roc::db::makeConnStr(
      config.db.host, config.db.port, config.db.name, config.db.user,
      config.db.password, config.db.sslMode, config.db.sslRootCert,
      config.db.sslCert, config.db.sslKey);

  app().registerHandler(
      "/api/health",
      [](const HttpRequestPtr &,
         std::function<void(const HttpResponsePtr &)> &&callback) {
        Json::Value value;
        value["ok"] = true;
        value["service"] = "roc-backend";
        callback(jsonResp(value));
      },
      {Get, Options});

  app().registerHandler(
      "/api/db/ping",
      [connStr](const HttpRequestPtr &,
                std::function<void(const HttpResponsePtr &)> &&callback) {
        Json::Value value;
        value["ok"] = false;
        try {
          roc::db::PostgresClient postgres(connStr);
          postgres.ping();
          value["ok"] = true;
          callback(jsonResp(value));
        } catch (const std::exception &error) {
          LOG_ERROR << "Database readiness check failed: " << error.what();
          value["error"] = "database unavailable";
          callback(jsonResp(value, 500));
        }
      },
      {Get, Options});

  roc::controller::registerAuthRoutes(config, connStr);
  roc::controller::registerAdminRoutes(config, connStr);
  roc::controller::registerProjectRoutes(config, connStr);
  roc::controller::registerMapArtifactRoutes(config, connStr);
  roc::controller::registerRoadNetworkRoutes(config, connStr);
  roc::controller::registerVehicleRoutes(config, connStr);
  roc::controller::registerDeploymentRoutes(config, connStr);

  roc::ws::StatusWsController::configure(
      config.auth.jwtSecret, connStr, config.realtime.allowedOrigins);
  roc::ws::DeviceWsController::configure(
      connStr, config.realtime.deviceHeartbeatSeconds,
      config.realtime.deviceIdleTimeoutSeconds);

  LOG_INFO << "Starting roc-backend on " << config.http.listenHost << ":"
           << config.http.listenPort;
  LOG_INFO << "DB target " << config.db.host << ":" << config.db.port << "/"
           << config.db.name;

  // Uploaded map bytes remain outside the document root and are served only
  // through authenticated project routes.
  app().setDocumentRoot("./public");
  // 10 MiB image payload plus bounded multipart headers.
  app().setClientMaxBodySize(11 * 1024 * 1024);
  app().addListener(config.http.listenHost,
                    static_cast<std::uint16_t>(config.http.listenPort));
  app().run();
  return 0;
}
