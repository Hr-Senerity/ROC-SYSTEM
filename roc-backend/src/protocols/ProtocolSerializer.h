#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <optional>
#include "protocols/common/types.h"

namespace roc::protocol {

// Abstract interface for protocol serializers
class IProtocolSerializer {
 public:
  virtual ~IProtocolSerializer() = default;

  // Serialize a RobotStatus to protocol-specific bytes
  virtual std::vector<uint8_t> serializeStatus(const RobotStatus &status) = 0;

  // Deserialize bytes to RobotStatus
  virtual std::optional<RobotStatus> deserializeStatus(const std::vector<uint8_t> &data) = 0;

  // Serialize a ControlCommand to protocol-specific bytes
  virtual std::vector<uint8_t> serializeCommand(const ControlCommand &cmd) = 0;

  // Deserialize bytes to ControlCommand
  virtual std::optional<ControlCommand> deserializeCommand(const std::vector<uint8_t> &data) = 0;

  // Get protocol type this serializer handles
  virtual ProtocolType protocolType() const = 0;
};

}  // namespace roc::protocol
