#pragma once

#include <drogon/WebSocketController.h>
#include <json/json.h>
#include <string>
#include <vector>

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

  static void configure(std::string jwtSecret,
                        std::string connStr,
                        std::vector<std::string> allowedOrigins = {});

  static void broadcastVehicle(const std::string &eventType,
                               const Json::Value &vehicle);
  static void broadcastProjectEvent(const std::string &eventType,
                                    const std::string &projectId,
                                    const std::string &payloadKey,
                                    const Json::Value &payload);
  static void broadcastVehicleDeleted(const std::string &projectId,
                                      const std::string &vehicleId);
};

}  // namespace roc::ws
