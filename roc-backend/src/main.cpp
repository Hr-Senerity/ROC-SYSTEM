#include <drogon/drogon.h>

#include "config/AppConfig.h"
#include "db/PostgresClient.h"

static drogon::HttpResponsePtr jsonResp(const Json::Value &v, int code = 200) {
  auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
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

  // Routes
  app().registerHandler(
      "/api/health",
      [](const HttpRequestPtr &, std::function<void(const HttpResponsePtr &)> &&cb) {
        Json::Value v;
        v["ok"] = true;
        v["service"] = "roc-backend";
        cb(jsonResp(v));
      },
      {Get});

  app().registerHandler(
      "/api/db/ping",
      [cfg](const HttpRequestPtr &, std::function<void(const HttpResponsePtr &)> &&cb) {
        Json::Value v;
        v["ok"] = false;
        try {
          const auto connStr = roc::db::makeConnStr(cfg.db.host, cfg.db.port, cfg.db.name, cfg.db.user, cfg.db.password);
          roc::db::PostgresClient pg(connStr);
          pg.ping();
          v["ok"] = true;
          cb(jsonResp(v));
        } catch (const std::exception &e) {
          v["error"] = e.what();
          cb(jsonResp(v, 500));
        }
      },
      {Get});

  LOG_INFO << "Starting roc-backend on " << cfg.http.listenHost << ":" << cfg.http.listenPort;
  LOG_INFO << "DB target " << cfg.db.host << ":" << cfg.db.port << "/" << cfg.db.name;

  app().addListener(cfg.http.listenHost, static_cast<uint16_t>(cfg.http.listenPort));
  app().run();
  return 0;
}

