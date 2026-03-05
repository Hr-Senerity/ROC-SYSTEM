#include "db/PostgresClient.h"

#include <pqxx/pqxx>
#include <stdexcept>

namespace roc::db {

PostgresClient::PostgresClient(std::string connStr) : connStr_(std::move(connStr)) {}

void PostgresClient::ping() const {
  pqxx::connection c(connStr_);
  if (!c.is_open()) {
    throw std::runtime_error("PostgreSQL connection is not open");
  }
  pqxx::work w(c);
  auto r = w.exec("SELECT 1");
  w.commit();
  if (r.size() != 1 || r[0].size() != 1 || r[0][0].is_null() || r[0][0].as<int>() != 1) {
    throw std::runtime_error("Unexpected ping result");
  }
}

std::string makeConnStr(const std::string &host,
                        int port,
                        const std::string &db,
                        const std::string &user,
                        const std::string &password) {
  // libpq connection string
  std::string s;
  s += "host=" + host;
  s += " port=" + std::to_string(port);
  s += " dbname=" + db;
  s += " user=" + user;
  if (!password.empty()) {
    s += " password=" + password;
  }
  s += " connect_timeout=3";
  return s;
}

}  // namespace roc::db

