#include "controllers/VehicleController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <sstream>

#include "db/PostgresClient.h"
#include "utils/JwtHelper.h"

namespace roc::controller {

using namespace drogon;

namespace {

Json::Value makeResp(bool ok, const std::string &msg = "") {
  Json::Value v;
  v["ok"] = ok;
  if (!msg.empty()) v["message"] = msg;
  return v;
}

HttpResponsePtr jsonResp(HttpStatusCode code, const Json::Value &v) {
  auto resp = HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(code);
  return resp;
}

std::optional<Json::Value> authReq(const HttpRequestPtr &req, const std::string &secret) {
  auto h = req->getHeader("Authorization");
  if (h.empty() || h.find("Bearer ") != 0) return std::nullopt;
  return roc::utils::verifyJwt(h.substr(7), secret);
}

std::string esc(const std::string &s) {
  std::string o;
  o.reserve(s.size() * 2);
  for (char c : s) { if (c == '\'') o += "''"; else o += c; }
  return o;
}

}  // namespace

void registerVehicleRoutes(const roc::config::AppConfig &cfg, const std::string &connStr) {
  auto jwtSecret = cfg.auth.jwtSecret;

  // GET /api/vehicles — list vehicles
  app().registerHandler(
      "/api/vehicles",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          std::string sql = "SELECT id, name, ip, status, cpu, memory, battery, "
              "localization_confidence, position_x, position_y, position_theta, "
              "velocity_linear, velocity_angular, delivery_path, last_heartbeat, created_at "
              "FROM vehicles";
          if (role != "super_admin") sql += " WHERE user_id = '" + esc(userId) + "'";
          sql += " ORDER BY created_at DESC";

          auto vehicles = pg.query(sql);
          Json::Value resp;
          resp["ok"] = true;
          resp["vehicles"] = vehicles;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "List vehicles: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // POST /api/vehicles — add vehicle
  app().registerHandler(
      "/api/vehicles",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        std::string name = (*body).get("name", "").asString();
        std::string ip = (*body).get("ip", "").asString();
        std::string projectId = (*body).get("project_id", "").asString();
        if (name.empty() || ip.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "name and ip required"))); return;
        }

        std::string userId = (*p)["user_id"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          std::ostringstream sql;
          sql << "INSERT INTO vehicles (user_id, name, ip";
          if (!projectId.empty()) sql << ", project_id";
          sql << ") VALUES ('" << esc(userId) << "', '" << esc(name) << "', '" << esc(ip) << "'";
          if (!projectId.empty()) sql << ", '" << esc(projectId) << "'";
          sql << ") RETURNING id";

          std::string id = pg.insertReturning(sql.str());
          auto v = pg.queryOne("SELECT id, name, ip, status, cpu, memory, battery, "
              "localization_confidence, position_x, position_y, position_theta, "
              "velocity_linear, velocity_angular, delivery_path, last_heartbeat, created_at "
              "FROM vehicles WHERE id = '" + esc(id) + "'");

          Json::Value resp;
          resp["ok"] = true;
          resp["vehicle"] = v;
          cb(jsonResp(k201Created, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Create vehicle: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Post, Options});

  // PATCH /api/vehicles/{id} — update vehicle (status, metrics, position)
  app().registerHandler(
      "/api/vehicles/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &vehId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        try {
          roc::db::PostgresClient pg(connStr);
          auto existing = pg.queryOne("SELECT id FROM vehicles WHERE id = '" + esc(vehId) + "'");
          if (existing.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Not found"))); return; }

          std::ostringstream sql;
          sql << "UPDATE vehicles SET last_heartbeat = NOW()";

          if (body->isMember("status"))
            sql << ", status = '" << esc((*body)["status"].asString()) << "'";
          if (body->isMember("cpu"))
            sql << ", cpu = " << (*body)["cpu"].asDouble();
          if (body->isMember("memory"))
            sql << ", memory = " << (*body)["memory"].asDouble();
          if (body->isMember("battery"))
            sql << ", battery = " << (*body)["battery"].asDouble();
          if (body->isMember("localization_confidence"))
            sql << ", localization_confidence = " << (*body)["localization_confidence"].asDouble();
          if (body->isMember("position_x"))
            sql << ", position_x = " << (*body)["position_x"].asDouble();
          if (body->isMember("position_y"))
            sql << ", position_y = " << (*body)["position_y"].asDouble();
          if (body->isMember("position_theta"))
            sql << ", position_theta = " << (*body)["position_theta"].asDouble();
          if (body->isMember("velocity_linear"))
            sql << ", velocity_linear = " << (*body)["velocity_linear"].asDouble();
          if (body->isMember("velocity_angular"))
            sql << ", velocity_angular = " << (*body)["velocity_angular"].asDouble();
          if (body->isMember("delivery_path"))
            sql << ", delivery_path = '" << esc((*body)["delivery_path"].toStyledString()) << "'";

          sql << " WHERE id = '" << esc(vehId) << "'";
          pg.execute(sql.str());

          auto v = pg.queryOne("SELECT id, name, ip, status, cpu, memory, battery, "
              "localization_confidence, position_x, position_y, position_theta, "
              "velocity_linear, velocity_angular, delivery_path, last_heartbeat, created_at "
              "FROM vehicles WHERE id = '" + esc(vehId) + "'");

          Json::Value resp;
          resp["ok"] = true;
          resp["vehicle"] = v;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Update vehicle: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Patch, Options});

  // DELETE /api/vehicles/{id}
  app().registerHandler(
      "/api/vehicles/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &vehId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        try {
          roc::db::PostgresClient pg(connStr);
          pg.execute("DELETE FROM vehicles WHERE id = '" + esc(vehId) + "'");
          cb(jsonResp(k200OK, makeResp(true, "Deleted")));
        } catch (const std::exception &e) {
          LOG_ERROR << "Delete vehicle: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  LOG_INFO << "Vehicle routes registered";
}

}  // namespace roc::controller
