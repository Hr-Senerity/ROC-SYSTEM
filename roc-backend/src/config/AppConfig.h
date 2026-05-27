#pragma once

#include <string>

namespace roc::config {

struct DbConfig {
  std::string host{"127.0.0.1"};
  int port{5432};
  std::string name{"roc_db"};
  std::string user{"roc_user"};
  std::string password{};
};

struct HttpConfig {
  std::string listenHost{"0.0.0.0"};
  int listenPort{8080};
};

struct AuthConfig {
  std::string jwtSecret{"roc-system-default-secret-change-in-production"};
  int tokenExpireSeconds{86400};  // 24 hours
};

struct AppConfig {
  HttpConfig http;
  DbConfig db;
  AuthConfig auth;
};

AppConfig loadFromEnv();

}  // namespace roc::config
