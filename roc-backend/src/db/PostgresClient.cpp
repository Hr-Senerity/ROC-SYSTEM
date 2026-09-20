#include "db/PostgresClient.h"

#include <json/json.h>
#include <pqxx/pqxx>
#include <stdexcept>
#include <sstream>

namespace roc::db {

PostgresClient::PostgresClient(std::string connStr) : connStr_(std::move(connStr)) {}

pqxx::connection PostgresClient::makeConn() const {
  return pqxx::connection(connStr_);
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
  for (pqxx::row::size_type i = 0; i < row.size(); ++i) {
    std::string colName = row[i].name();
    if (row[i].is_null()) {
      obj[colName] = Json::nullValue;
    } else {
      try {
        const auto value = row[i].as<std::string>();
        switch (row[i].type()) {
          case 16:  // bool
            obj[colName] = value == "t" || value == "true" || value == "1";
            break;
          case 20:  // int8
          case 21:  // int2
          case 23:  // int4
            obj[colName] = static_cast<Json::Int64>(std::stoll(value));
            break;
          case 700:   // float4
          case 701:   // float8
          case 1700:  // numeric
            obj[colName] = std::stod(value);
            break;
          case 114:   // json
          case 3802: {  // jsonb
            Json::CharReaderBuilder builder;
            Json::Value parsed;
            std::string error;
            std::istringstream stream(value);
            obj[colName] = Json::parseFromStream(builder, stream, &parsed, &error)
                ? parsed
                : Json::Value(value);
            break;
          }
          default:
            obj[colName] = value;
            break;
        }
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

std::string PostgresClient::insertReturningParams(
    const std::string &sql,
    const std::vector<std::string> &params) const {
  auto c = makeConn();
  pqxx::work w(c);
  auto r = w.exec_params(sql, pqxx::prepare::make_dynamic_params(params));
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
                        const std::string &password,
                        const std::string &sslMode,
                        const std::string &sslRootCert,
                        const std::string &sslCert,
                        const std::string &sslKey) {
  const auto quote = [](const std::string &value) {
    std::string quoted{"'"};
    quoted.reserve(value.size() + 2);
    for (const char character : value) {
      if (character == '\\' || character == '\'') quoted += '\\';
      quoted += character;
    }
    quoted += '\'';
    return quoted;
  };

  std::string s;
  s += "host=" + quote(host);
  s += " port=" + std::to_string(port);
  s += " dbname=" + quote(db);
  s += " user=" + quote(user);
  if (!password.empty()) {
    s += " password=" + quote(password);
  }
  s += " sslmode=" + quote(sslMode);
  if (!sslRootCert.empty()) s += " sslrootcert=" + quote(sslRootCert);
  if (!sslCert.empty()) s += " sslcert=" + quote(sslCert);
  if (!sslKey.empty()) s += " sslkey=" + quote(sslKey);
  s += " connect_timeout=3";
  return s;
}

}  // namespace roc::db
