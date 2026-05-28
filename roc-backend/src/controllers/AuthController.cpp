#include "controllers/AuthController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <chrono>

#include "db/PostgresClient.h"
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

        if (username.empty() || email.empty() || password.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "username, email, password are required")));
          return;
        }

        if (password.size() < 6) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Password must be at least 6 characters")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);

          // Check if username or email already exists
          auto existing = pg.queryOneParams(
              "SELECT id FROM users WHERE username = $1 OR email = $2",
              {username, email});
          if (!existing.isNull()) {
            cb(jsonResp(k409Conflict, makeResp(false, "Username or email already exists")));
            return;
          }

          std::string salt = roc::utils::generateSalt();
          std::string hash = roc::utils::hashPassword(password, salt);

          std::string userId = pg.insertReturning(
              "INSERT INTO users (username, email, password_hash, salt, role) "
              "VALUES ('" + username + "', '" + email + "', '" + hash + "', '" + salt + "', 'regular') "
              "RETURNING id");

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
