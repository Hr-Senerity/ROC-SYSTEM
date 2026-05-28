#pragma once

#include "protocols/ProtocolSerializer.h"
#include <memory>
#include <vector>
#include <functional>
#include <map>
#include <mutex>

namespace roc::protocol {

using StatusCallback = std::function<void(const RobotStatus &)>;
using CommandCallback = std::function<void(const ControlCommand &)>;

class ProtocolBridge {
 public:
  ProtocolBridge();

  bool ingest(const std::vector<uint8_t> &data, ProtocolType hint = ProtocolType::JSON);

  std::vector<uint8_t> serializeStatus(const RobotStatus &s, ProtocolType proto);
  std::vector<uint8_t> serializeCommand(const ControlCommand &c, ProtocolType proto);

  void onStatusReport(StatusCallback cb);
  void onControlCommand(CommandCallback cb);

  // Message queue: robot polls for pending commands
  void enqueueCommand(const ControlCommand &cmd, ProtocolType proto);
  std::vector<std::string> pollCommands(const std::string &robotId);
  void enqueueStatusResponse(const std::string &robotId, const std::string &json);

  IProtocolSerializer *serializer(ProtocolType proto);

 private:
  std::unique_ptr<IProtocolSerializer> jsonSerializer_;
  std::unique_ptr<IProtocolSerializer> rocSerializer_;

  std::vector<StatusCallback> statusCallbacks_;
  std::vector<CommandCallback> commandCallbacks_;

  std::mutex mutex_;
  std::map<std::string, std::vector<std::string>> pendingCommands_;
};

}  // namespace roc::protocol
