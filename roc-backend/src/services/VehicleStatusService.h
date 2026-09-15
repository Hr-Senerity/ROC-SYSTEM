#pragma once

#include <json/json.h>
#include <optional>
#include <string>

#include "protocols/common/types.h"

namespace roc::service {

class VehicleStatusService {
 public:
  static std::optional<Json::Value> applyStatus(
      const std::string &connStr,
      const roc::protocol::RobotStatus &status,
      std::string *error = nullptr);
};

}  // namespace roc::service
