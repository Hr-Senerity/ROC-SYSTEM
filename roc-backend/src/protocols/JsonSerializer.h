#pragma once

#include "protocols/ProtocolSerializer.h"
#include <json/json.h>

namespace roc::protocol {

class JsonSerializer : public IProtocolSerializer {
 public:
  std::vector<uint8_t> serializeStatus(const RobotStatus &status) override;
  std::optional<RobotStatus> deserializeStatus(const std::vector<uint8_t> &data) override;

  std::vector<uint8_t> serializeCommand(const ControlCommand &cmd) override;
  std::optional<ControlCommand> deserializeCommand(const std::vector<uint8_t> &data) override;

  ProtocolType protocolType() const override { return ProtocolType::JSON; }

 private:
  static Json::Value statusToJson(const RobotStatus &s);
  static RobotStatus jsonToStatus(const Json::Value &j);
  static Json::Value commandToJson(const ControlCommand &c);
  static ControlCommand jsonToCommand(const Json::Value &j);
};

}  // namespace roc::protocol
