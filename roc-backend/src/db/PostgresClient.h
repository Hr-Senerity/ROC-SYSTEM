#pragma once

#include <string>

namespace roc::db {

class PostgresClient {
 public:
  explicit PostgresClient(std::string connStr);

  // minimal connectivity test (SELECT 1)
  void ping() const;

 private:
  std::string connStr_;
};

std::string makeConnStr(const std::string &host,
                        int port,
                        const std::string &db,
                        const std::string &user,
                        const std::string &password);

}  // namespace roc::db

