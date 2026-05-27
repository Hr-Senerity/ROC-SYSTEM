#pragma once

#include <drogon/WebSocketController.h>
#include <drogon/PubSubService.h>
#include <set>
#include <mutex>

namespace roc::ws {

class StatusWsController : public drogon::WebSocketController<StatusWsController> {
 public:
  void handleNewMessage(const drogon::WebSocketConnectionPtr &wsConn,
                        std::string &&message,
                        const drogon::WebSocketMessageType &type) override;

  void handleConnectionClosed(const drogon::WebSocketConnectionPtr &wsConn) override;

  void handleNewConnection(const drogon::HttpRequestPtr &req,
                           const drogon::WebSocketConnectionPtr &wsConn) override;

  WS_PATH_LIST_BEGIN
    WS_PATH_ADD("/ws/status");
  WS_PATH_LIST_END

  // Broadcast a status update to all connected clients
  static void broadcast(const std::string &json);

 private:
  static std::set<drogon::WebSocketConnectionPtr> connections_;
  static std::mutex mutex_;
};

}  // namespace roc::ws
