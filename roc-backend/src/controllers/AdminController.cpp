#include "controllers/AdminController.h"

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

HttpResponsePtr json(HttpStatusCode code, const Json::Value &v) {
  auto resp = HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(code);
  return resp;
}

// Extract and verify JWT, return payload or null
std::optional<Json::Value> authRequest(const HttpRequestPtr &req, const std::string &jwtSecret) {
  std::string authHeader = req->getHeader("Authorization");
  if (authHeader.empty() || authHeader.find("Bearer ") != 0) {
    return std::nullopt;
  }
  return roc::utils::verifyJwt(authHeader.substr(7), jwtSecret);
}

bool isSuperAdmin(const std::optional<Json::Value> &payload) {
  return payload.has_value() && (*payload)["role"].asString() == "super_admin";
}

std::string escapeSql(const std::string &s) {
  std::string out;
  out.reserve(s.size() * 2);
  for (char c : s) {
    if (c == '\'') out += "''";
    else out += c;
  }
  return out;
}

}  // namespace

void registerAdminRoutes(const roc::config::AppConfig &cfg, const std::string &connStr) {
  auto jwtSecret = cfg.auth.jwtSecret;

  // GET /api/admin/users — list users (paginated)
  app().registerHandler(
      "/api/admin/users",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          int page = 1;
          int limit = 20;
          std::string search;
          std::string roleFilter;
          std::string statusFilter;

          auto p = req->getParameter("page");
          if (!p.empty()) page = std::max(1, std::stoi(p));
          auto l = req->getParameter("limit");
          if (!l.empty()) limit = std::clamp(std::stoi(l), 1, 100);
          search = req->getParameter("search");
          roleFilter = req->getParameter("role");
          statusFilter = req->getParameter("status");

          int offset = (page - 1) * limit;

          roc::db::PostgresClient pg(connStr);

          // Build WHERE clauses
          std::ostringstream whereClause;
          bool hasWhere = false;
          if (!search.empty()) {
            whereClause << " WHERE (username ILIKE '%" << escapeSql(search)
                        << "%' OR email ILIKE '%" << escapeSql(search) << "%')";
            hasWhere = true;
          }
          if (!roleFilter.empty()) {
            whereClause << (hasWhere ? " AND" : " WHERE")
                        << " role = '" << escapeSql(roleFilter) << "'";
            hasWhere = true;
          }
          if (!statusFilter.empty()) {
            whereClause << (hasWhere ? " AND" : " WHERE")
                        << " status = '" << escapeSql(statusFilter) << "'";
            hasWhere = true;
          }

          // Count total
          std::string countSql = "SELECT COUNT(*) FROM users" + whereClause.str();
          auto countResult = pg.query(countSql);
          int total = countResult.size() > 0 ? std::stoi(countResult[0]["count"].asString()) : 0;

          // Fetch page
          std::ostringstream dataSql;
          dataSql << "SELECT id, username, email, role, status, created_at, updated_at FROM users"
                  << whereClause.str()
                  << " ORDER BY created_at DESC"
                  << " LIMIT " << limit << " OFFSET " << offset;
          auto users = pg.query(dataSql.str());

          Json::Value resp;
          resp["ok"] = true;
          resp["users"] = users;
          resp["total"] = total;
          resp["page"] = page;
          resp["limit"] = limit;
          cb(json(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin list users error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // GET /api/admin/users/{id} — user detail with stats
  app().registerHandler(
      "/api/admin/users/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &userId) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          auto user = pg.queryOneParams(
              "SELECT id, username, email, role, status, avatar, created_at, updated_at FROM users WHERE id = $1",
              {userId});

          if (user.isNull()) {
            cb(json(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          // Count related data
          auto projCount = pg.queryOneParams(
              "SELECT COUNT(*) as count FROM projects WHERE user_id = $1", {userId});
          auto vehCount = pg.queryOneParams(
              "SELECT COUNT(*) as count FROM vehicles WHERE user_id = $1", {userId});

          Json::Value resp;
          resp["ok"] = true;
          resp["user"] = user;
          resp["stats"]["projects"] = projCount.isNull() ? 0 : std::stoi(projCount["count"].asString());
          resp["stats"]["vehicles"] = vehCount.isNull() ? 0 : std::stoi(vehCount["count"].asString());
          cb(json(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin user detail error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // PATCH /api/admin/users/{id}/status — enable/disable user
  app().registerHandler(
      "/api/admin/users/{id}/status",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &userId) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        auto json = req->getJsonObject();
        if (!json) {
          cb(json(k400BadRequest, makeResp(false, "Invalid JSON body")));
          return;
        }

        std::string newStatus = (*json).get("status", "").asString();
        if (newStatus != "active" && newStatus != "disabled") {
          cb(json(k400BadRequest, makeResp(false, "status must be 'active' or 'disabled'")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          // Prevent disabling self
          std::string adminId = (*payload)["user_id"].asString();
          if (userId == adminId) {
            cb(json(k400BadRequest, makeResp(false, "Cannot modify your own status")));
            return;
          }

          auto existing = pg.queryOneParams("SELECT id FROM users WHERE id = $1", {userId});
          if (existing.isNull()) {
            cb(json(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          pg.executeParams(
              "UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2",
              {newStatus, userId});

          cb(json(k200OK, makeResp(true, "User status updated")));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin update status error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Patch, Options});

  // DELETE /api/admin/users/{id} — delete user
  app().registerHandler(
      "/api/admin/users/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &userId) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          std::string adminId = (*payload)["user_id"].asString();
          if (userId == adminId) {
            cb(json(k400BadRequest, makeResp(false, "Cannot delete your own account")));
            return;
          }

          roc::db::PostgresClient pg(connStr);

          auto existing = pg.queryOneParams("SELECT id FROM users WHERE id = $1", {userId});
          if (existing.isNull()) {
            cb(json(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          // CASCADE will handle related projects, vehicles, etc.
          pg.executeParams("DELETE FROM users WHERE id = $1", {userId});

          cb(json(k200OK, makeResp(true, "User deleted")));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin delete user error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Delete, Options});

  // GET /api/admin/users/{id}/vehicles
  app().registerHandler(
      "/api/admin/users/{id}/vehicles",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &userId) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          auto vehicles = pg.queryParams(
              "SELECT id, name, ip, status, cpu, memory, battery, localization_confidence, "
              "position_x, position_y, position_theta, velocity_linear, velocity_angular, "
              "last_heartbeat, created_at FROM vehicles WHERE user_id = $1 ORDER BY created_at DESC",
              {userId});

          Json::Value resp;
          resp["ok"] = true;
          resp["vehicles"] = vehicles;
          cb(json(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin user vehicles error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // GET /api/admin/stats — system overview
  app().registerHandler(
      "/api/admin/stats",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(json(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          auto totalUsers = pg.queryOne("SELECT COUNT(*) as count FROM users");
          auto activeUsers = pg.queryOne("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
          auto totalProjects = pg.queryOne("SELECT COUNT(*) as count FROM projects");
          auto totalVehicles = pg.queryOne("SELECT COUNT(*) as count FROM vehicles");
          auto onlineVehicles = pg.queryOne("SELECT COUNT(*) as count FROM vehicles WHERE status = 'online'");

          Json::Value resp;
          resp["ok"] = true;
          resp["stats"]["total_users"] = totalUsers.isNull() ? 0 : std::stoi(totalUsers["count"].asString());
          resp["stats"]["active_users"] = activeUsers.isNull() ? 0 : std::stoi(activeUsers["count"].asString());
          resp["stats"]["total_projects"] = totalProjects.isNull() ? 0 : std::stoi(totalProjects["count"].asString());
          resp["stats"]["total_vehicles"] = totalVehicles.isNull() ? 0 : std::stoi(totalVehicles["count"].asString());
          resp["stats"]["online_vehicles"] = onlineVehicles.isNull() ? 0 : std::stoi(onlineVehicles["count"].asString());
          cb(json(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin stats error: " << e.what();
          cb(json(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  LOG_INFO << "Admin routes registered";
}

}  // namespace roc::controller
