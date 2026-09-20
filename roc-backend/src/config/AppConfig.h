#pragma once

#include <string>
#include <vector>

namespace roc::config {

struct DbConfig {
  std::string host{"127.0.0.1"};
  int port{5432};
  std::string name{"roc_db"};
  std::string user{"roc_user"};
  std::string password{};
  std::string sslMode{"disable"};
  std::string sslRootCert{};
  std::string sslCert{};
  std::string sslKey{};
};

struct HttpConfig {
  std::string listenHost{"0.0.0.0"};
  int listenPort{8080};
};

struct AuthConfig {
  std::string jwtSecret{"roc-system-default-secret-change-in-production"};
  int tokenExpireSeconds{86400};
};

struct RealtimeConfig {
  // Empty in development means any Origin may attempt the authenticated
  // browser handshake. Production must provide an explicit allowlist.
  std::vector<std::string> allowedOrigins;
  int deviceHeartbeatSeconds{30};
  int deviceIdleTimeoutSeconds{45};
};

struct DeploymentConfig {
  int taskLeaseSeconds{30 * 60};
};

struct StorageConfig {
  std::string mapDirectory{"./static/maps"};
};

struct AppConfig {
  HttpConfig http;
  DbConfig db;
  AuthConfig auth;
  RealtimeConfig realtime;
  DeploymentConfig deployment;
  StorageConfig storage;
};

AppConfig loadFromEnv();

}  // namespace roc::config
