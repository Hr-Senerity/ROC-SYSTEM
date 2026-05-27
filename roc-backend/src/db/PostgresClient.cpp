#include "db/PostgresClient.h"

#include <json/json.h>
#include <pqxx/pqxx>
#include <stdexcept>
#include <sstream>

namespace roc::db {

PostgresClient::PostgresClient(std::string connStr) : connStr_(std::move(connStr)) {}

pqxx::connection PostgresClient::makeConn() const {
  pqxx::connection c(connStr_);
  if (!c.is_open()) {
    throw std::runtime_error("PostgreSQL connection is not open");
  }
  return c;
}

void PostgresClient::ping() const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec("SELECT 1");
  w.commit();
  if (r.size() != 1 || r[0].size() != 1 || r[0][0].is_null() || r[0][0].as<int>() != 1) {
    throw std::runtime_error("Unexpected ping result");
  }
}

Json::Value PostgresClient::rowToJson(const pqxx::row &row) {
  Json::Value obj;
  for (size_t i = 0; i < row.size(); ++i) {
    const char *colName = row.column_name(static_cast<int>(i));
    if (row[i].is_null()) {
      obj[colName] = Json::nullValue;
    } else {
      // Try common types
      const auto oid = row.column_type(static_cast<int>(i));
      try {
        obj[colName] = row[i].as<std::string>();
      } catch (...) {
        obj[colName] = Json::nullValue;
      }
    }
  }
  return obj;
}

Json::Value PostgresClient::query(const std::string &sql) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec(sql);
  w.commit();

  Json::Value arr(Json::arrayValue);
  for (auto const &row : r) {
    arr.append(rowToJson(row));
  }
  return arr;
}

Json::Value PostgresClient::queryParams(const std::string &sql,
                                        const std::vector<std::string> &params) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec_params(sql, pqxx::prepare::make_dynamic_params(params));
  w.commit();

  Json::Value arr(Json::arrayValue);
  for (auto const &row : r) {
    arr.append(rowToJson(row));
  }
  return arr;
}

Json::Value PostgresClient::queryOne(const std::string &sql) const {
  auto result = query(sql);
  if (result.size() > 0) return result[0];
  return Json::nullValue;
}

Json::Value PostgresClient::queryOneParams(const std::string &sql,
                                           const std::vector<std::string> &params) const {
  auto result = queryParams(sql, params);
  if (result.size() > 0) return result[0];
  return Json::nullValue;
}

size_t PostgresClient::execute(const std::string &sql) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec(sql);
  w.commit();
  return r.affected_rows();
}

size_t PostgresClient::executeParams(const std::string &sql,
                                     const std::vector<std::string> &params) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec_params(sql, pqxx::prepare::make_dynamic_params(params));
  w.commit();
  return r.affected_rows();
}

std::string PostgresClient::insertReturning(const std::string &sql) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec(sql);
  w.commit();
  if (r.size() > 0 && r[0].size() > 0 && !r[0][0].is_null()) {
    return r[0][0].as<std::string>();
  }
  return "";
}

std::string makeConnStr(const std::string &host,
                        int port,
                        const std::string &db,
                        const std::string &user,
                        const std::string &password) {
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
