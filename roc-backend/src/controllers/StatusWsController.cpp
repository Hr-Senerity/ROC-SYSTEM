#include "controllers/StatusWsController.h"

#include <drogon/drogon.h>

namespace roc::ws {

std::set<drogon::WebSocketConnectionPtr> StatusWsController::connections_;
std::mutex StatusWsController::mutex_;

void StatusWsController::handleNewConnection(
    const drogon::HttpRequestPtr &,
    const drogon::WebSocketConnectionPtr &wsConn) {
  LOG_INFO << "WebSocket client connected";
  {
    std::lock_guard<std::mutex> lock(mutex_);
    connections_.insert(wsConn);
  }
}

void StatusWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr &,
    std::string &&message,
    const drogon::WebSocketMessageType &) {
  // Clients can send ping/heartbeat, echo back
  if (message == "ping") {
    // Will be handled by broadcast if needed, otherwise just acknowledge
  }
}

void StatusWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr &wsConn) {
  LOG_INFO << "WebSocket client disconnected";
  std::lock_guard<std::mutex> lock(mutex_);
  connections_.erase(wsConn);
}

void StatusWsController::broadcast(const std::string &json) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (auto it = connections_.begin(); it != connections_.end(); ) {
    auto &conn = *it;
    if (conn->connected()) {
      conn->send(json);
      ++it;
    } else {
      it = connections_.erase(it);
    }
  }
}

}  // namespace roc::ws
