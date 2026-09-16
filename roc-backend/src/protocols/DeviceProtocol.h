#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>

#include <json/json.h>

#include "protocols/common/types.h"

namespace roc::protocol {

inline constexpr int kDeviceProtocolVersion = 1;
inline constexpr std::size_t kMaxDeviceMessageBytes = 64 * 1024;

struct DeviceEnvelope {
  std::string messageId;
  std::string type;
  std::uint64_t sequence{0};
  std::string timestamp;
  Json::Value payload{Json::objectValue};
};

struct DeviceProtocolError {
  std::string code;
  std::string message;
};

std::optional<DeviceEnvelope> parseDeviceEnvelope(
    const std::string &message,
    DeviceProtocolError *error = nullptr);

std::optional<RobotStatus> telemetryFromEnvelope(
    const DeviceEnvelope &envelope,
    const std::string &vehicleId,
    DeviceProtocolError *error = nullptr);

std::string optionalLibraryVersion(
    const DeviceEnvelope &envelope,
    DeviceProtocolError *error = nullptr);

Json::Value makeDeviceMessage(
    const std::string &type,
    std::uint64_t serverSequence,
    const Json::Value &payload = Json::Value(Json::objectValue));

Json::Value makeDeviceAck(
    std::uint64_t serverSequence,
    const DeviceEnvelope &envelope,
    bool duplicate = false);

Json::Value makeDeviceError(
    std::uint64_t serverSequence,
    const std::string &code,
    const std::string &message,
    const std::string &messageId = "");

}  // namespace roc::protocol