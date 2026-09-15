#include "config/AppConfig.h"

#include <cstdlib>
#include <sstream>
#include <stdexcept>

namespace roc::config {
namespace {

std::string getenvOr(const char *key, const std::string &fallback) {
  const char *v = std::getenv(key);
  if (!v || !*v) return fallback;
  return std::string(v);
}

int getenvIntOr(const char *key, int fallback) {
  const char *v = std::getenv(key);
  if (!v || !*v) return fallback;
  try {
    return std::stoi(v);
  } catch (...) {
    throw std::runtime_error(std::string("Invalid int env: ") + key);
  }
}

std::vector<std::string> getenvCsv(const char *key) {
  const char *raw = std::getenv(key);
  if (!raw || !*raw) return {};
  std::vector<std::string> values;
  std::istringstream input(raw);
  std::string value;
  while (std::getline(input, value, ',')) {
    const auto start = value.find_first_not_of(" \t");
    const auto end = value.find_last_not_of(" \t");
    if (start != std::string::npos) {
      values.push_back(value.substr(start, end - start + 1));
    }
  }
  return values;
}

bool getenvBoolOr(const char *key, bool fallback) {
  const char *raw = std::getenv(key);
  if (!raw || !*raw) return fallback;
  const std::string value(raw);
  if (value == "1" || value == "true" || value == "TRUE") return true;
  if (value == "0" || value == "false" || value == "FALSE") return false;
  throw std::runtime_error(std::string("Invalid bool env: ") + key);
}

}  // namespace

AppConfig loadFromEnv() {
  AppConfig cfg;

  // HTTP
  cfg.http.listenHost = getenvOr("BACKEND_LISTEN_HOST", cfg.http.listenHost);
  cfg.http.listenPort = getenvIntOr("BACKEND_LISTEN_PORT", cfg.http.listenPort);

  // DB
  cfg.db.host = getenvOr("DB_HOST", cfg.db.host);
  cfg.db.port = getenvIntOr("DB_PORT", cfg.db.port);
  cfg.db.name = getenvOr("DB_NAME", cfg.db.name);
  cfg.db.user = getenvOr("DB_USER", cfg.db.user);
  cfg.db.password = getenvOr("DB_PASSWORD", cfg.db.password);

  // Auth
  cfg.auth.jwtSecret = getenvOr("JWT_SECRET", cfg.auth.jwtSecret);
  cfg.auth.tokenExpireSeconds = getenvIntOr("JWT_EXPIRE_SECONDS", cfg.auth.tokenExpireSeconds);

  // Device protocol endpoints fail closed while this value is empty.
  cfg.device.token = getenvOr("DEVICE_TOKEN", cfg.device.token);
  cfg.device.allowSharedToken = getenvBoolOr(
      "DEVICE_ALLOW_SHARED_TOKEN", cfg.device.allowSharedToken);
  cfg.realtime.allowedOrigins = getenvCsv("WS_ALLOWED_ORIGINS");

  // Private map file storage. Files are not exposed by Drogon's document root.
  cfg.storage.mapDirectory = getenvOr("MAP_STORAGE_DIR", cfg.storage.mapDirectory);

  return cfg;
}

}  // namespace roc::config
