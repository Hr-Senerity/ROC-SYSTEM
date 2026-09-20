#pragma once

#include <json/json.h>
#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <pqxx/pqxx>

namespace roc::db {

class PostgresClient {
 public:
  explicit PostgresClient(std::string connStr);

  void ping() const;

  // Execute a SELECT query, returns all rows as Json::Value array
  class Json::Value query(const std::string &sql) const;

  // Execute a parameterized SELECT query
  class Json::Value queryParams(const std::string &sql,
                                const std::vector<std::string> &params) const;

  // Execute a single-row SELECT, returns Json::Value or null
  class Json::Value queryOne(const std::string &sql) const;
  class Json::Value queryOneParams(const std::string &sql,
                                   const std::vector<std::string> &params) const;

  // Execute INSERT/UPDATE/DELETE, returns number of affected rows
  size_t execute(const std::string &sql) const;
  size_t executeParams(const std::string &sql,
                       const std::vector<std::string> &params) const;

  // Execute INSERT and return the first column of the first row as string
  std::string insertReturning(const std::string &sql) const;
  std::string insertReturningParams(const std::string &sql,
                                    const std::vector<std::string> &params) const;

 private:
  pqxx::connection makeConn() const;
  static class Json::Value rowToJson(const pqxx::row &row);

  std::string connStr_;
};

std::string makeConnStr(const std::string &host,
                        int port,
                        const std::string &db,
                        const std::string &user,
                        const std::string &password,
                        const std::string &sslMode = "disable",
                        const std::string &sslRootCert = {},
                        const std::string &sslCert = {},
                        const std::string &sslKey = {});

}  // namespace roc::db
