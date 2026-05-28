#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <mutex>
#include <queue>
#include <condition_variable>
#include <pqxx/pqxx>

namespace roc::db {

class ConnectionPool {
 public:
  explicit ConnectionPool(const std::string &connStr, size_t poolSize = 4);
  ~ConnectionPool();

  // Borrow a connection (blocking). Returns via unique_ptr with custom deleter.
  std::unique_ptr<pqxx::connection, std::function<void(pqxx::connection *)>> borrow();

  size_t size() const { return poolSize_; }
  size_t available() const;

 private:
  void returnConnection(pqxx::connection *conn);
  pqxx::connection *createConnection();

  std::string connStr_;
  size_t poolSize_;
  std::queue<pqxx::connection *> pool_;
  mutable std::mutex mutex_;
  std::condition_variable cv_;
};

// Thread-safe singleton pool
void initPool(const std::string &connStr, size_t poolSize = 4);
ConnectionPool &pool();

}  // namespace roc::db
