#pragma once

#include <cstdint>
#include <json/json.h>
#include <optional>
#include <string>

#include "protocols/common/types.h"

namespace roc::service {

enum class VehicleUpdateOutcome {
  Applied,
  Duplicate,
  Unauthorized,
  Rejected,
};

struct VehicleUpdateResult {
  VehicleUpdateOutcome outcome{VehicleUpdateOutcome::Rejected};
  Json::Value vehicle{Json::nullValue};
  std::string error;
};

class VehicleStatusService {
 public:
  static VehicleUpdateResult applyTelemetry(
      const std::string &connStr,
      const roc::protocol::RobotStatus &status,
      std::uint64_t clientSequence,
      int protocolVersion,
      const std::string &libraryVersion,
      const std::string &deviceTokenHash);

  static VehicleUpdateResult applyHeartbeat(
      const std::string &connStr,
      const std::string &vehicleId,
      std::uint64_t clientSequence,
      int protocolVersion,
      const std::string &libraryVersion,
      const std::string &deviceTokenHash);

  static std::optional<Json::Value> markConnected(
      const std::string &connStr,
      const std::string &vehicleId,
      const std::string &deviceTokenHash);

  static std::optional<Json::Value> markDisconnected(
      const std::string &connStr,
      const std::string &vehicleId,
      const std::string &deviceTokenHash);
};

}  // namespace roc::service
