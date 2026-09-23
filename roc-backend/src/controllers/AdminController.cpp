#include "controllers/AdminController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <sstream>
#include <stdexcept>

#include "db/PostgresClient.h"
#include "utils/InputValidation.h"
#include "utils/InvitationCode.h"
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
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
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
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin list users error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
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
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          auto user = pg.queryOneParams(
              "SELECT id, username, email, role, status, avatar, created_at, updated_at FROM users WHERE id = $1",
              {userId});

          if (user.isNull()) {
            cb(jsonResp(k404NotFound, makeResp(false, "User not found")));
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
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin user detail error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
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
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        auto json = req->getJsonObject();
        if (!json) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON body")));
          return;
        }

        std::string newStatus = (*json).get("status", "").asString();
        if (newStatus != "active" && newStatus != "disabled") {
          cb(jsonResp(k400BadRequest, makeResp(false, "status must be 'active' or 'disabled'")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          // Prevent disabling self
          std::string adminId = (*payload)["user_id"].asString();
          if (userId == adminId) {
            cb(jsonResp(k400BadRequest, makeResp(false, "Cannot modify your own status")));
            return;
          }

          auto existing = pg.queryOneParams("SELECT id FROM users WHERE id = $1", {userId});
          if (existing.isNull()) {
            cb(jsonResp(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          pg.executeParams(
              "UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2",
              {newStatus, userId});

          cb(jsonResp(k200OK, makeResp(true, "User status updated")));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin update status error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
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
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          std::string adminId = (*payload)["user_id"].asString();
          if (userId == adminId) {
            cb(jsonResp(k400BadRequest, makeResp(false, "Cannot delete your own account")));
            return;
          }

          roc::db::PostgresClient pg(connStr);

          auto existing = pg.queryOneParams("SELECT id FROM users WHERE id = $1", {userId});
          if (existing.isNull()) {
            cb(jsonResp(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          // Audit log
          pg.executeParams("INSERT INTO audit_logs (user_id, action, target_type, target_id, detail) VALUES ($1, 'delete_user', 'user', $2, $3)",
                           {adminId, userId, std::string("Deleted by ") + adminId});

          pg.executeParams("DELETE FROM users WHERE id = $1", {userId});

          cb(jsonResp(k200OK, makeResp(true, "User deleted")));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin delete user error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
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
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
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
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin user vehicles error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // GET /api/admin/invitation-codes — recent one-time registration codes
  app().registerHandler(
      "/api/admin/invitation-codes",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        const auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);
          auto invitations = pg.query(
              "SELECT i.id, i.code, i.created_at, i.used_at, i.revoked_at, "
              "creator.username AS created_by_username, "
              "consumer.username AS used_by_username, "
              "CASE WHEN i.used_at IS NOT NULL THEN 'used' "
              "WHEN i.revoked_at IS NOT NULL THEN 'revoked' ELSE 'available' END AS status "
              "FROM registration_invites i "
              "LEFT JOIN users creator ON creator.id = i.created_by "
              "LEFT JOIN users consumer ON consumer.id = i.used_by "
              "ORDER BY i.created_at DESC LIMIT 100");

          Json::Value response;
          response["ok"] = true;
          response["invitation_codes"] = invitations;
          cb(jsonResp(k200OK, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Admin list invitation codes error: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // POST /api/admin/invitation-codes — generate a five-character code
  app().registerHandler(
      "/api/admin/invitation-codes",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        const auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }

        try {
          const std::string adminId = (*payload)["user_id"].asString();
          pqxx::connection connection(connStr);
          pqxx::work transaction(connection);
          pqxx::result inserted;

          for (int attempt = 0; attempt < 20 && inserted.empty(); ++attempt) {
            const auto code = roc::utils::generateInvitationCode();
            inserted = transaction.exec_params(
                "INSERT INTO registration_invites (code, created_by) "
                "VALUES ($1, $2::uuid) ON CONFLICT (code) DO NOTHING "
                "RETURNING id, code, created_at",
                code, adminId);
          }
          if (inserted.empty()) {
            throw std::runtime_error("Unable to allocate a unique invitation code");
          }

          const std::string invitationId = inserted[0]["id"].as<std::string>();
          transaction.exec_params(
              "INSERT INTO audit_logs (user_id, action, target_type, target_id, detail) "
              "VALUES ($1::uuid, 'create_invitation_code', 'registration_invite', $2, "
              "'Created one-time registration invitation')",
              adminId, invitationId);
          transaction.commit();

          Json::Value invitation;
          invitation["id"] = invitationId;
          invitation["code"] = inserted[0]["code"].as<std::string>();
          invitation["created_at"] = inserted[0]["created_at"].as<std::string>();
          invitation["created_by_username"] = (*payload)["username"].asString();
          invitation["status"] = "available";

          Json::Value response;
          response["ok"] = true;
          response["invitation_code"] = invitation;
          cb(jsonResp(k201Created, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Admin create invitation code error: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Post, Options});

  // DELETE /api/admin/invitation-codes/{id} — revoke an unused code
  app().registerHandler(
      "/api/admin/invitation-codes/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &invitationId) {
        const auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
          return;
        }
        if (!roc::utils::isUuid(invitationId)) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid invitation id")));
          return;
        }

        try {
          const std::string adminId = (*payload)["user_id"].asString();
          pqxx::connection connection(connStr);
          pqxx::work transaction(connection);
          const auto revoked = transaction.exec_params(
              "UPDATE registration_invites "
              "SET revoked_by = $1::uuid, revoked_at = NOW() "
              "WHERE id = $2::uuid AND used_at IS NULL AND revoked_at IS NULL "
              "RETURNING id",
              adminId, invitationId);
          if (revoked.empty()) {
            const auto existing = transaction.exec_params(
                "SELECT id FROM registration_invites WHERE id = $1::uuid",
                invitationId);
            if (existing.empty()) {
              cb(jsonResp(k404NotFound, makeResp(false, "Invitation code not found")));
            } else {
              cb(jsonResp(k409Conflict, makeResp(
                  false, "Invitation code is already used or revoked")));
            }
            return;
          }

          transaction.exec_params(
              "INSERT INTO audit_logs (user_id, action, target_type, target_id, detail) "
              "VALUES ($1::uuid, 'revoke_invitation_code', 'registration_invite', $2, "
              "'Revoked unused registration invitation')",
              adminId, invitationId);
          transaction.commit();
          cb(jsonResp(k200OK, makeResp(true, "Invitation code revoked")));
        } catch (const std::exception &error) {
          LOG_ERROR << "Admin revoke invitation code error: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Delete, Options});

  // GET /api/admin/stats — system overview
  app().registerHandler(
      "/api/admin/stats",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto payload = authRequest(req, jwtSecret);
        if (!isSuperAdmin(payload)) {
          cb(jsonResp(k403Forbidden, makeResp(false, "Requires super_admin privilege")));
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
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Admin stats error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  LOG_INFO << "Admin routes registered";
}

}  // namespace roc::controller
