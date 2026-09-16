#pragma once

#include <drogon/WebSocketController.h>
#include <string>

namespace roc::ws {

class DeviceWsController : public drogon::WebSocketController<DeviceWsController> {
 public:
  void handleNewMessage(const drogon::WebSocketConnectionPtr &connection,
                        std::string &&message,
                        const drogon::WebSocketMessageType &type) override;

  void handleConnectionClosed(
      const drogon::WebSocketConnectionPtr &connection) override;

  void handleNewConnection(
      const drogon::HttpRequestPtr &request,
      const drogon::WebSocketConnectionPtr &connection) override;

  WS_PATH_LIST_BEGIN
    WS_PATH_ADD("/ws/device");
  WS_PATH_LIST_END

  static void configure(std::string connStr);
  static void notifyPendingTasks(const std::string &vehicleId);
  static void disconnectVehicle(const std::string &vehicleId,
                                const std::string &reason,
                                const std::string &preservedTokenHash = "");
};

}  // namespace roc::ws