#include "middleware/AuthMiddleware.h"

#include <json/json.h>
#include <cstdlib>
#include "utils/JwtHelper.h"

namespace roc::middleware {

void AuthFilter::doFilter(const drogon::HttpRequestPtr &req,
                          drogon::FilterCallback &&fcb,
                          drogon::FilterChainCallback &&fccb) {
  // CORS preflight — pass through
  if (req->getMethod() == drogon::Options) {
    fccb();
    return;
  }

  std::string authHeader = req->getHeader("Authorization");
  if (authHeader.empty() || authHeader.find("Bearer ") != 0) {
    Json::Value v;
    v["ok"] = false;
    v["message"] = "Missing or invalid Authorization header";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(drogon::k401Unauthorized);
    fcb(resp);
    return;
  }

  std::string token = authHeader.substr(7);
  auto secret = drogon::app().getCustomConfig()["jwt_secret"].asString();
  if (secret.empty()) {
    secret = "roc-system-default-secret-change-in-production";
  }

  auto payload = roc::utils::verifyJwt(token, secret);
  if (!payload.has_value()) {
    Json::Value v;
    v["ok"] = false;
    v["message"] = "Invalid or expired token";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(drogon::k401Unauthorized);
    fcb(resp);
    return;
  }

  // Store user info in request attributes for downstream handlers
  req->attributes()->insert("user_id", (*payload)["user_id"].asString());
  req->attributes()->insert("username", (*payload)["username"].asString());
  req->attributes()->insert("role", (*payload)["role"].asString());

  fccb();
}

void SuperAdminFilter::doFilter(const drogon::HttpRequestPtr &req,
                                drogon::FilterCallback &&fcb,
                                drogon::FilterChainCallback &&fccb) {
  if (req->getMethod() == drogon::Options) {
    fccb();
    return;
  }

  // First apply auth check
  std::string authHeader = req->getHeader("Authorization");
  if (authHeader.empty() || authHeader.find("Bearer ") != 0) {
    Json::Value v;
    v["ok"] = false;
    v["message"] = "Missing or invalid Authorization header";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(drogon::k401Unauthorized);
    fcb(resp);
    return;
  }

  std::string token = authHeader.substr(7);
  const char *envSecret = std::getenv("JWT_SECRET");
  std::string secret = envSecret ? std::string(envSecret) : "roc-system-default-secret-change-in-production";

  auto payload = roc::utils::verifyJwt(token, secret);
  if (!payload.has_value()) {
    Json::Value v;
    v["ok"] = false;
    v["message"] = "Invalid or expired token";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(drogon::k401Unauthorized);
    fcb(resp);
    return;
  }

  std::string role = (*payload)["role"].asString();
  if (role != "super_admin") {
    Json::Value v;
    v["ok"] = false;
    v["message"] = "Requires super_admin privilege";
    auto resp = drogon::HttpResponse::newHttpJsonResponse(v);
    resp->setStatusCode(drogon::k403Forbidden);
    fcb(resp);
    return;
  }

  req->attributes()->insert("user_id", (*payload)["user_id"].asString());
  req->attributes()->insert("username", (*payload)["username"].asString());
  req->attributes()->insert("role", role);

  fccb();
}

}  // namespace roc::middleware
