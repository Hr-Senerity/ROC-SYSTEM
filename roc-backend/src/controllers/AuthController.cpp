#include "controllers/AuthController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <chrono>
#include <stdexcept>

#include "db/PostgresClient.h"
#include "utils/InvitationCode.h"
#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::controller {

using namespace drogon;

static Json::Value makeResp(bool ok, const std::string &msg = "") {
  Json::Value v;
  v["ok"] = ok;
  if (!msg.empty()) v["message"] = msg;
  return v;
}

static HttpResponsePtr jsonResp(HttpStatusCode code, const Json::Value &v) {
  auto resp = HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(code);
  return resp;
}

void registerAuthRoutes(const roc::config::AppConfig &cfg, const std::string &connStr) {
  auto jwtSecret = cfg.auth.jwtSecret;
  auto tokenExpire = cfg.auth.tokenExpireSeconds;

  // POST /api/auth/register
  app().registerHandler(
      "/api/auth/register",
      [connStr, jwtSecret, tokenExpire](const HttpRequestPtr &req,
                                         std::function<void(const HttpResponsePtr &)> &&cb) {
        auto body = req->getJsonObject();
        if (!body) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON body")));
          return;
        }

        std::string username = (*body).get("username", "").asString();
        std::string email = (*body).get("email", "").asString();
        std::string password = (*body).get("password", "").asString();
        const auto invitationCode = roc::utils::normalizeInvitationCode(
            (*body).get("invitation_code", "").asString());

        if (username.empty() || email.empty() || password.empty() ||
            !invitationCode.has_value()) {
          cb(jsonResp(k400BadRequest, makeResp(
              false,
              "username, email, password and a five-character invitation_code are required")));
          return;
        }

        if (password.size() < 6) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Password must be at least 6 characters")));
          return;
        }

        try {
          // Lock, validate and consume the one-time invitation code in the same
          // transaction as account creation. Concurrent attempts can therefore
          // never create two accounts from one code.
          pqxx::connection connection(connStr);
          pqxx::work transaction(connection);
          const auto invitation = transaction.exec_params(
              "SELECT id FROM registration_invites "
              "WHERE code = $1 AND used_at IS NULL AND revoked_at IS NULL "
              "FOR UPDATE",
              *invitationCode);
          if (invitation.empty()) {
            cb(jsonResp(k403Forbidden, makeResp(
                false, "Invalid or unavailable invitation code")));
            return;
          }

          const auto existing = transaction.exec_params(
              "SELECT id FROM users WHERE username = $1 OR email = $2",
              username, email);
          if (!existing.empty()) {
            cb(jsonResp(k409Conflict, makeResp(false, "Username or email already exists")));
            return;
          }

          std::string salt = roc::utils::generateSalt();
          std::string hash = roc::utils::hashPassword(password, salt);

          const auto inserted = transaction.exec_params(
              "INSERT INTO users (username, email, password_hash, salt, role) "
              "VALUES ($1, $2, $3, $4, 'regular') "
              "ON CONFLICT DO NOTHING RETURNING id",
              username, email, hash, salt);
          if (inserted.empty()) {
            cb(jsonResp(k409Conflict, makeResp(false, "Username or email already exists")));
            return;
          }
          const std::string userId = inserted[0][0].as<std::string>();

          const auto consumed = transaction.exec_params(
              "UPDATE registration_invites "
              "SET used_by = $1::uuid, used_at = NOW() "
              "WHERE id = $2::uuid AND used_at IS NULL AND revoked_at IS NULL",
              userId, invitation[0][0].as<std::string>());
          if (consumed.affected_rows() != 1) {
            throw std::runtime_error("Invitation code consumption failed");
          }
          transaction.commit();

          // Create JWT
          Json::Value payload;
          payload["user_id"] = userId;
          payload["username"] = username;
          payload["role"] = "regular";
          auto now = std::chrono::system_clock::now();
          auto exp = now + std::chrono::seconds(tokenExpire);
          payload["exp"] = std::chrono::duration_cast<std::chrono::seconds>(
              exp.time_since_epoch()).count();
          payload["iat"] = std::chrono::duration_cast<std::chrono::seconds>(
              now.time_since_epoch()).count();

          std::string token = roc::utils::createJwt(payload, jwtSecret);

          Json::Value resp;
          resp["ok"] = true;
          resp["token"] = token;
          resp["user"] = payload;
          cb(jsonResp(k201Created, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Register error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Post, Options});

  // POST /api/auth/login
  app().registerHandler(
      "/api/auth/login",
      [connStr, jwtSecret, tokenExpire](const HttpRequestPtr &req,
                                         std::function<void(const HttpResponsePtr &)> &&cb) {
        auto body = req->getJsonObject();
        if (!body) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON body")));
          return;
        }

        std::string username = (*body).get("username", "").asString();
        std::string password = (*body).get("password", "").asString();

        if (username.empty() || password.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "username and password are required")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          auto user = pg.queryOneParams(
              "SELECT id, username, email, password_hash, salt, role, status FROM users WHERE username = $1",
              {username});

          if (user.isNull()) {
            cb(jsonResp(k401Unauthorized, makeResp(false, "Invalid username or password")));
            return;
          }

          if (user["status"].asString() == "disabled") {
            cb(jsonResp(k403Forbidden, makeResp(false, "Account is disabled, contact administrator")));
            return;
          }

          std::string hash = user["password_hash"].asString();
          std::string salt = user["salt"].asString();

          if (!roc::utils::verifyPassword(password, salt, hash)) {
            cb(jsonResp(k401Unauthorized, makeResp(false, "Invalid username or password")));
            return;
          }

          // Create JWT
          Json::Value payload;
          payload["user_id"] = user["id"].asString();
          payload["username"] = username;
          payload["role"] = user["role"].asString();
          auto now = std::chrono::system_clock::now();
          auto exp = now + std::chrono::seconds(tokenExpire);
          payload["exp"] = std::chrono::duration_cast<std::chrono::seconds>(
              exp.time_since_epoch()).count();
          payload["iat"] = std::chrono::duration_cast<std::chrono::seconds>(
              now.time_since_epoch()).count();

          std::string token = roc::utils::createJwt(payload, jwtSecret);

          Json::Value resp;
          resp["ok"] = true;
          resp["token"] = token;
          resp["user"] = payload;
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Login error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Post, Options});

  // GET /api/auth/me
  app().registerHandler(
      "/api/auth/me",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        // Extract token from Authorization header
        std::string authHeader = req->getHeader("Authorization");
        if (authHeader.empty() || authHeader.find("Bearer ") != 0) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Missing or invalid Authorization header")));
          return;
        }

        std::string token = authHeader.substr(7);  // Remove "Bearer "

        auto payload = roc::utils::verifyJwt(token, jwtSecret);
        if (!payload.has_value()) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Invalid or expired token")));
          return;
        }

        std::string userId = (*payload)["user_id"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto user = pg.queryOneParams(
              "SELECT id, username, email, role, status, avatar, created_at, updated_at FROM users WHERE id = $1",
              {userId});

          if (user.isNull()) {
            cb(jsonResp(k404NotFound, makeResp(false, "User not found")));
            return;
          }

          Json::Value resp;
          resp["ok"] = true;
          resp["user"] = user;
          cb(jsonResp(k200OK, resp));

        } catch (const std::exception &e) {
          LOG_ERROR << "Auth/me error: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Get, Options});

  // POST /api/auth/change-password
  app().registerHandler(
      "/api/auth/change-password",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto authHeader = req->getHeader("Authorization");
        if (authHeader.empty() || authHeader.find("Bearer ") != 0) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Missing or invalid Authorization header")));
          return;
        }

        auto payload = roc::utils::verifyJwt(authHeader.substr(7), jwtSecret);
        if (!payload.has_value()) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Invalid or expired token")));
          return;
        }

        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        std::string oldPw = (*body).get("old_password", "").asString();
        std::string newPw = (*body).get("new_password", "").asString();
        if (oldPw.empty() || newPw.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "old_password and new_password required"))); return;
        }
        if (newPw.size() < 6) {
          cb(jsonResp(k400BadRequest, makeResp(false, "New password must be at least 6 characters"))); return;
        }

        std::string userId = (*payload)["user_id"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto user = pg.queryOneParams(
              "SELECT password_hash, salt FROM users WHERE id = $1", {userId});
          if (user.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "User not found"))); return; }

          if (!roc::utils::verifyPassword(oldPw, user["salt"].asString(), user["password_hash"].asString())) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Current password is incorrect"))); return;
          }

          std::string salt = roc::utils::generateSalt();
          std::string hash = roc::utils::hashPassword(newPw, salt);
          pg.executeParams("UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3",
                           {hash, salt, userId});

          cb(jsonResp(k200OK, makeResp(true, "Password changed")));
        } catch (const std::exception &e) {
          LOG_ERROR << "Change password: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal server error")));
        }
      },
      {Post, Options});

  // POST /api/auth/logout
  app().registerHandler(
      "/api/auth/logout",
      [](const HttpRequestPtr &,
         std::function<void(const HttpResponsePtr &)> &&cb) {
        // Stateless JWT — client discards token
        cb(jsonResp(k200OK, makeResp(true, "Logged out")));
      },
      {Post, Options});

  LOG_INFO << "Auth routes registered";
}

}  // namespace roc::controller
