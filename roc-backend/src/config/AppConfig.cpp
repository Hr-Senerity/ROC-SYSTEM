#include "config/AppConfig.h"

#include <cstdlib>
#include <sstream>
#include <stdexcept>

namespace roc::config {
namespace {

std::string getenvOr(const char *key, const std::string &fallback) {
  const char *value = std::getenv(key);
  if (!value || !*value) return fallback;
  return std::string(value);
}

int getenvIntOr(const char *key, int fallback) {
  const char *value = std::getenv(key);
  if (!value || !*value) return fallback;
  try {
    return std::stoi(value);
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

}  // namespace

AppConfig loadFromEnv() {
  AppConfig config;
  config.http.listenHost =
      getenvOr("BACKEND_LISTEN_HOST", config.http.listenHost);
  config.http.listenPort =
      getenvIntOr("BACKEND_LISTEN_PORT", config.http.listenPort);

  config.db.host = getenvOr("DB_HOST", config.db.host);
  config.db.port = getenvIntOr("DB_PORT", config.db.port);
  config.db.name = getenvOr("DB_NAME", config.db.name);
  config.db.user = getenvOr("DB_USER", config.db.user);
  config.db.password = getenvOr("DB_PASSWORD", config.db.password);

  config.auth.jwtSecret = getenvOr("JWT_SECRET", config.auth.jwtSecret);
  config.auth.tokenExpireSeconds =
      getenvIntOr("JWT_EXPIRE_SECONDS", config.auth.tokenExpireSeconds);

  config.realtime.allowedOrigins = getenvCsv("WS_ALLOWED_ORIGINS");
  config.storage.mapDirectory =
      getenvOr("MAP_STORAGE_DIR", config.storage.mapDirectory);
  return config;
}

}  // namespace roc::config