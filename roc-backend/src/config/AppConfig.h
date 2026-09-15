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
};

struct HttpConfig {
  std::string listenHost{"0.0.0.0"};
  int listenPort{8080};
};

struct AuthConfig {
  std::string jwtSecret{"roc-system-default-secret-change-in-production"};
  int tokenExpireSeconds{86400};  // 24 hours
};

struct DeviceConfig {
  // Optional migration-only shared token. Per-vehicle credentials are the
  // default; shared-token access must be explicitly enabled.
  std::string token;
  bool allowSharedToken{false};
};

struct RealtimeConfig {
  // Empty in development means any Origin may attempt the authenticated
  // handshake. Production should provide an explicit comma-separated list.
  std::vector<std::string> allowedOrigins;
};

struct StorageConfig {
  // Uploaded maps live outside the HTTP document root and are only served by
  // the authenticated project-map image endpoint.
  std::string mapDirectory{"./static/maps"};
};

struct AppConfig {
  HttpConfig http;
  DbConfig db;
  AuthConfig auth;
  DeviceConfig device;
  RealtimeConfig realtime;
  StorageConfig storage;
};

AppConfig loadFromEnv();

}  // namespace roc::config
