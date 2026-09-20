#include <cassert>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <vector>

#include "config/AppConfig.h"
#include "db/PostgresClient.h"

namespace {

constexpr const char *kDbEnv[] = {
    "DB_HOST",       "DB_PORT",    "DB_NAME",    "DB_USER",
    "DB_PASSWORD",   "DB_SSLMODE", "DB_SSLROOTCERT",
    "DB_SSLCERT",    "DB_SSLKEY", "DEVICE_HEARTBEAT_SECONDS",
    "DEVICE_IDLE_TIMEOUT_SECONDS", "TASK_LEASE_SECONDS"};

void clearDbEnv() {
  for (const auto *name : kDbEnv) unsetenv(name);
}

void expectConfigError() {
  bool threw = false;
  try {
    (void)roc::config::loadFromEnv();
  } catch (const std::runtime_error &) {
    threw = true;
  }
  assert(threw);
}

}  // namespace

int main() {
  clearDbEnv();
  auto config = roc::config::loadFromEnv();
  assert(config.db.sslMode == "disable");
  assert(config.db.sslRootCert.empty());
  assert(config.realtime.deviceHeartbeatSeconds == 30);
  assert(config.realtime.deviceIdleTimeoutSeconds == 45);
  assert(config.deployment.taskLeaseSeconds == 1800);

  setenv("DB_SSLMODE", "verify-full", 1);
  setenv("DB_SSLROOTCERT", "/run/secrets/roc-db/root.crt", 1);
  setenv("DB_SSLCERT", "/run/secrets/roc-db/client.crt", 1);
  setenv("DB_SSLKEY", "/run/secrets/roc-db/client.key", 1);
  config = roc::config::loadFromEnv();
  assert(config.db.sslMode == "verify-full");
  assert(config.db.sslRootCert == "/run/secrets/roc-db/root.crt");
  assert(config.db.sslCert == "/run/secrets/roc-db/client.crt");
  assert(config.db.sslKey == "/run/secrets/roc-db/client.key");

  setenv("DB_SSLMODE", "prefer", 1);
  expectConfigError();

  setenv("DB_SSLMODE", "verify-ca", 1);
  unsetenv("DB_SSLROOTCERT");
  expectConfigError();

  setenv("DB_SSLMODE", "require", 1);
  unsetenv("DB_SSLCERT");
  setenv("DB_SSLKEY", "/run/secrets/roc-db/client.key", 1);
  expectConfigError();

  unsetenv("DB_SSLKEY");
  setenv("DEVICE_HEARTBEAT_SECONDS", "1", 1);
  setenv("DEVICE_IDLE_TIMEOUT_SECONDS", "2", 1);
  setenv("TASK_LEASE_SECONDS", "3", 1);
  config = roc::config::loadFromEnv();
  assert(config.realtime.deviceHeartbeatSeconds == 1);
  assert(config.realtime.deviceIdleTimeoutSeconds == 2);
  assert(config.deployment.taskLeaseSeconds == 3);

  setenv("DEVICE_IDLE_TIMEOUT_SECONDS", "1", 1);
  expectConfigError();

  const auto connection = roc::db::makeConnStr(
      "db.example.com", 5432, "roc db", "roc'user", "p\\ass'word",
      "verify-full", "/run/secrets/roc-db/root.crt",
      "/run/secrets/roc-db/client.crt", "/run/secrets/roc-db/client.key");
  assert(connection.find("host='db.example.com'") != std::string::npos);
  assert(connection.find("dbname='roc db'") != std::string::npos);
  assert(connection.find("user='roc\\'user'") != std::string::npos);
  assert(connection.find("password='p\\\\ass\\'word'") !=
         std::string::npos);
  assert(connection.find("sslmode='verify-full'") != std::string::npos);
  assert(connection.find("sslrootcert='/run/secrets/roc-db/root.crt'") !=
         std::string::npos);

  clearDbEnv();
}
