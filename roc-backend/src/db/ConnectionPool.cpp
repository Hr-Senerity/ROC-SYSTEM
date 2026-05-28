#include "db/ConnectionPool.h"

#include <drogon/drogon.h>
#include <stdexcept>

namespace roc::db {

static std::unique_ptr<ConnectionPool> g_pool;

void initPool(const std::string &connStr, size_t poolSize) {
  g_pool = std::make_unique<ConnectionPool>(connStr, poolSize);
  LOG_INFO << "DB connection pool initialized: " << poolSize << " connections";
}

ConnectionPool &pool() {
  if (!g_pool) throw std::runtime_error("ConnectionPool not initialized");
  return *g_pool;
}

ConnectionPool::ConnectionPool(const std::string &connStr, size_t poolSize)
    : connStr_(connStr), poolSize_(poolSize) {
  for (size_t i = 0; i < poolSize; ++i) {
    pool_.push(createConnection());
  }
}

ConnectionPool::~ConnectionPool() {
  std::lock_guard<std::mutex> lock(mutex_);
  while (!pool_.empty()) {
    delete pool_.front();
    pool_.pop();
  }
}

size_t ConnectionPool::available() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return pool_.size();
}

std::unique_ptr<pqxx::connection, std::function<void(pqxx::connection *)>>
ConnectionPool::borrow() {
  std::unique_lock<std::mutex> lock(mutex_);
  cv_.wait(lock, [this] { return !pool_.empty(); });
  auto *conn = pool_.front();
  pool_.pop();
  return {conn, [this](pqxx::connection *c) { returnConnection(c); }};
}

void ConnectionPool::returnConnection(pqxx::connection *conn) {
  if (!conn) return;
  try {
    if (!conn->is_open()) {
      delete conn;
      conn = createConnection();
    }
  } catch (...) {
    delete conn;
    conn = createConnection();
  }
  {
    std::lock_guard<std::mutex> lock(mutex_);
    pool_.push(conn);
  }
  cv_.notify_one();
}

pqxx::connection *ConnectionPool::createConnection() {
  auto *c = new pqxx::connection(connStr_);
  if (!c->is_open()) {
    delete c;
    throw std::runtime_error("Failed to open PostgreSQL connection");
  }
  return c;
}

}  // namespace roc::db
