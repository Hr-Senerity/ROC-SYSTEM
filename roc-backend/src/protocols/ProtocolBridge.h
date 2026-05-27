#pragma once

#include "protocols/ProtocolSerializer.h"
#include <memory>
#include <vector>
#include <functional>

namespace roc::protocol {

using StatusCallback = std::function<void(const RobotStatus &)>;
using CommandCallback = std::function<void(const ControlCommand &)>;

class ProtocolBridge {
 public:
  ProtocolBridge();

  // Route incoming raw data to the correct protocol parser
  // Returns true if the data was recognized as a valid protocol message
  bool ingest(const std::vector<uint8_t> &data, ProtocolType hint = ProtocolType::JSON);

  // Serialize a status for output
  std::vector<uint8_t> serializeStatus(const RobotStatus &s, ProtocolType proto);

  // Serialize a command for output
  std::vector<uint8_t> serializeCommand(const ControlCommand &c, ProtocolType proto);

  // Register callbacks
  void onStatusReport(StatusCallback cb);
  void onControlCommand(CommandCallback cb);

  // Get serializer for a specific protocol
  IProtocolSerializer *serializer(ProtocolType proto);

 private:
  std::unique_ptr<IProtocolSerializer> jsonSerializer_;
  std::unique_ptr<IProtocolSerializer> rocSerializer_;

  std::vector<StatusCallback> statusCallbacks_;
  std::vector<CommandCallback> commandCallbacks_;
};

}  // namespace roc::protocol
