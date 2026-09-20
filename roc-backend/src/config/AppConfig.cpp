#include "config/AppConfig.h"

#include <cstdlib>
#include <array>
#include <algorithm>
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

int getenvIntInRange(const char *key, int fallback, int minimum, int maximum) {
  const auto value = getenvIntOr(key, fallback);
  if (value < minimum || value > maximum) {
    throw std::runtime_error(std::string("Invalid range for env: ") + key);
  }
  return value;
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
  config.db.sslMode = getenvOr("DB_SSLMODE", config.db.sslMode);
  config.db.sslRootCert = getenvOr("DB_SSLROOTCERT", config.db.sslRootCert);
  config.db.sslCert = getenvOr("DB_SSLCERT", config.db.sslCert);
  config.db.sslKey = getenvOr("DB_SSLKEY", config.db.sslKey);

  constexpr std::array<const char *, 4> allowedSslModes{
      "disable", "require", "verify-ca", "verify-full"};
  if (std::find(allowedSslModes.begin(), allowedSslModes.end(),
                config.db.sslMode) == allowedSslModes.end()) {
    throw std::runtime_error(
        "Invalid DB_SSLMODE; expected disable, require, verify-ca or "
        "verify-full");
  }
  if ((config.db.sslMode == "verify-ca" ||
       config.db.sslMode == "verify-full") &&
      config.db.sslRootCert.empty()) {
    throw std::runtime_error(
        "DB_SSLROOTCERT is required when DB_SSLMODE is verify-ca or "
        "verify-full");
  }
  if (config.db.sslCert.empty() != config.db.sslKey.empty()) {
    throw std::runtime_error(
        "DB_SSLCERT and DB_SSLKEY must be configured together");
  }

  config.auth.jwtSecret = getenvOr("JWT_SECRET", config.auth.jwtSecret);
  config.auth.tokenExpireSeconds =
      getenvIntOr("JWT_EXPIRE_SECONDS", config.auth.tokenExpireSeconds);

  config.realtime.allowedOrigins = getenvCsv("WS_ALLOWED_ORIGINS");
  config.realtime.deviceHeartbeatSeconds = getenvIntInRange(
      "DEVICE_HEARTBEAT_SECONDS", config.realtime.deviceHeartbeatSeconds, 1,
      3600);
  config.realtime.deviceIdleTimeoutSeconds = getenvIntInRange(
      "DEVICE_IDLE_TIMEOUT_SECONDS", config.realtime.deviceIdleTimeoutSeconds,
      2, 7200);
  if (config.realtime.deviceIdleTimeoutSeconds <=
      config.realtime.deviceHeartbeatSeconds) {
    throw std::runtime_error(
        "DEVICE_IDLE_TIMEOUT_SECONDS must be greater than "
        "DEVICE_HEARTBEAT_SECONDS");
  }
  config.deployment.taskLeaseSeconds = getenvIntInRange(
      "TASK_LEASE_SECONDS", config.deployment.taskLeaseSeconds, 1, 86400);
  config.storage.mapDirectory =
      getenvOr("MAP_STORAGE_DIR", config.storage.mapDirectory);
  return config;
}

}  // namespace roc::config
