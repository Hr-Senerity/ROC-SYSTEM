#include "config/AppConfig.h"

#include <cstdlib>
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

}  // namespace

AppConfig loadFromEnv() {
  AppConfig cfg;

  // HTTP
  cfg.http.listenHost = getenvOr("BACKEND_LISTEN_HOST", cfg.http.listenHost);
  cfg.http.listenPort = getenvIntOr("BACKEND_LISTEN_PORT", cfg.http.listenPort);

  // DB (align with scripts: deploy-backend-docker.sh)
  cfg.db.host = getenvOr("DB_HOST", cfg.db.host);
  cfg.db.port = getenvIntOr("DB_PORT", cfg.db.port);
  cfg.db.name = getenvOr("DB_NAME", cfg.db.name);
  cfg.db.user = getenvOr("DB_USER", cfg.db.user);
  cfg.db.password = getenvOr("DB_PASSWORD", cfg.db.password);

  return cfg;
}

}  // namespace roc::config

