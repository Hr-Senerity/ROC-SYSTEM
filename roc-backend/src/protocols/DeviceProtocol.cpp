#include "protocols/DeviceProtocol.h"

#include <charconv>
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <initializer_list>
#include <random>
#include <regex>
#include <sstream>
#include <system_error>

#include "utils/InputValidation.h"

namespace roc::protocol {
namespace {

void setError(DeviceProtocolError *error,
              const std::string &code,
              const std::string &message) {
  if (!error) return;
  error->code = code;
  error->message = message;
}

bool hasOnlyMembers(const Json::Value &object,
                    std::initializer_list<const char *> allowed) {
  for (const auto &name : object.getMemberNames()) {
    bool known = false;
    for (const auto *candidate : allowed) {
      if (name == candidate) {
        known = true;
        break;
      }
    }
    if (!known) return false;
  }
  return true;
}

bool parseSequence(const Json::Value &value, std::uint64_t *sequence) {
  if (!sequence || !value.isString()) return false;
  const auto text = value.asString();
  if (text.empty() || text.size() > 20) return false;
  std::uint64_t parsed = 0;
  const auto result = std::from_chars(text.data(), text.data() + text.size(), parsed);
  if (result.ec != std::errc{} || result.ptr != text.data() + text.size() ||
      parsed == 0) {
    return false;
  }
  *sequence = parsed;
  return true;
}

bool finiteNumber(const Json::Value &value, double *result) {
  if (!result || !value.isNumeric()) return false;
  const auto parsed = value.asDouble();
  if (!std::isfinite(parsed)) return false;
  *result = parsed;
  return true;
}

std::string utcTimestamp() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);
  std::tm utc{};
#ifdef _WIN32
  gmtime_s(&utc, &time);
#else
  gmtime_r(&time, &utc);
#endif
  std::ostringstream output;
  output << std::put_time(&utc, "%Y-%m-%dT%H:%M:%SZ");
  return output.str();
}

std::string randomMessageId() {
  std::random_device source;
  std::uniform_int_distribution<unsigned int> byte(0, 255);
  unsigned char data[16];
  for (auto &value : data) value = static_cast<unsigned char>(byte(source));
  data[6] = static_cast<unsigned char>((data[6] & 0x0fU) | 0x40U);
  data[8] = static_cast<unsigned char>((data[8] & 0x3fU) | 0x80U);

  std::ostringstream output;
  output << std::hex << std::setfill('0');
  for (std::size_t index = 0; index < 16; ++index) {
    if (index == 4 || index == 6 || index == 8 || index == 10) output << '-';
    output << std::setw(2) << static_cast<unsigned int>(data[index]);
  }
  return output.str();
}

}  // namespace

std::optional<DeviceEnvelope> parseDeviceEnvelope(
    const std::string &message,
    DeviceProtocolError *error) {
  if (message.size() > kMaxDeviceMessageBytes) {
    setError(error, "message_too_large", "Message exceeds 64 KiB");
    return std::nullopt;
  }

  Json::Value root;
  Json::CharReaderBuilder reader;
  std::string parseError;
  std::istringstream input(message);
  if (!Json::parseFromStream(reader, input, &root, &parseError) ||
      !root.isObject()) {
    setError(error, "invalid_json", "Message must be a JSON object");
    return std::nullopt;
  }

  if (!root["protocol_version"].isInt() ||
      root["protocol_version"].asInt() != kDeviceProtocolVersion) {
    setError(error, "unsupported_protocol_version", "protocol_version must be 1");
    return std::nullopt;
  }
  if (!root["message_id"].isString() ||
      !roc::utils::isUuid(root["message_id"].asString())) {
    setError(error, "invalid_message_id", "message_id must be a UUID");
    return std::nullopt;
  }
  if (!root["type"].isString() || root["type"].asString().empty() ||
      root["type"].asString().size() > 64) {
    setError(error, "invalid_type", "type must be a non-empty string");
    return std::nullopt;
  }
  std::uint64_t sequence = 0;
  if (!parseSequence(root["sequence"], &sequence)) {
    setError(error, "invalid_sequence", "sequence must be a positive decimal string");
    return std::nullopt;
  }
  static const std::regex kRfc3339(
      R"(^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$)");
  const auto timestamp = root["timestamp"].isString()
      ? root["timestamp"].asString()
      : std::string{};
  if (!std::regex_match(timestamp, kRfc3339)) {
    setError(error, "invalid_timestamp", "timestamp must be an RFC 3339 string");
    return std::nullopt;
  }
  if (!root["payload"].isObject()) {
    setError(error, "invalid_payload", "payload must be a JSON object");
    return std::nullopt;
  }
  if (root.isMember("robot_id") || root["payload"].isMember("robot_id") ||
      root["payload"].isMember("vehicle_id")) {
    setError(error, "identity_not_allowed", "Vehicle identity is derived from the Device token");
    return std::nullopt;
  }
  if (!hasOnlyMembers(root, {"protocol_version", "message_id", "type",
                             "sequence", "timestamp", "payload"})) {
    setError(error, "unknown_field", "Message contains an unknown envelope field");
    return std::nullopt;
  }
  const auto messageType = root["type"].asString();
  if (messageType == "heartbeat" &&
      !hasOnlyMembers(root["payload"], {"library_version"})) {
    setError(error, "unknown_field", "Heartbeat payload contains an unknown field");
    return std::nullopt;
  }
  if (messageType == "telemetry" &&
      !hasOnlyMembers(root["payload"],
                      {"library_version", "online", "cpu_usage", "memory_usage",
                       "battery_level", "localization_confidence", "position",
                       "velocity"})) {
    setError(error, "unknown_field", "Telemetry payload contains an unknown field");
    return std::nullopt;
  }

  DeviceEnvelope envelope;
  envelope.messageId = root["message_id"].asString();
  envelope.type = root["type"].asString();
  envelope.sequence = sequence;
  envelope.timestamp = root["timestamp"].asString();
  envelope.payload = root["payload"];
  return envelope;
}

std::optional<RobotStatus> telemetryFromEnvelope(
    const DeviceEnvelope &envelope,
    const std::string &vehicleId,
    DeviceProtocolError *error) {
  if (envelope.type != "telemetry") {
    setError(error, "invalid_message_type", "Telemetry parser requires type=telemetry");
    return std::nullopt;
  }

  const auto &payload = envelope.payload;
  if (!payload["online"].isBool()) {
    setError(error, "invalid_telemetry", "payload.online must be boolean");
    return std::nullopt;
  }

  RobotStatus status{};
  status.robot_id = vehicleId;
  status.online = payload["online"].asBool();
  if (!finiteNumber(payload["cpu_usage"], &status.cpu_usage) ||
      !finiteNumber(payload["memory_usage"], &status.memory_usage) ||
      !finiteNumber(payload["localization_confidence"],
                    &status.localization_confidence)) {
    setError(error, "invalid_telemetry", "Telemetry percentages must be finite numbers");
    return std::nullopt;
  }
  if (!payload["battery_level"].isInt() && !payload["battery_level"].isUInt()) {
    setError(error, "invalid_telemetry", "payload.battery_level must be an integer");
    return std::nullopt;
  }
  status.battery_level = payload["battery_level"].asInt();

  const auto &position = payload["position"];
  const auto &velocity = payload["velocity"];
  if (!position.isObject() || !velocity.isObject() ||
      !hasOnlyMembers(position, {"x", "y", "theta"}) ||
      !hasOnlyMembers(velocity, {"linear", "angular"}) ||
      !finiteNumber(position["x"], &status.position_x) ||
      !finiteNumber(position["y"], &status.position_y) ||
      !finiteNumber(position["theta"], &status.position_theta) ||
      !finiteNumber(velocity["linear"], &status.velocity_linear) ||
      !finiteNumber(velocity["angular"], &status.velocity_angular)) {
    setError(error, "invalid_telemetry", "position and velocity must contain finite numbers");
    return std::nullopt;
  }
  status.timestamp = std::chrono::system_clock::now();
  return status;
}

std::string optionalLibraryVersion(
    const DeviceEnvelope &envelope,
    DeviceProtocolError *error) {
  if (!envelope.payload.isMember("library_version")) return {};
  const auto &value = envelope.payload["library_version"];
  static const std::regex kLibraryVersion(
      R"(^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$)");
  const auto libraryVersion = value.isString() ? value.asString() : std::string{};
  if (!std::regex_match(libraryVersion, kLibraryVersion)) {
    setError(error, "invalid_library_version",
             "library_version must use 1-64 letters, digits, dots, plus, minus, or underscore");
    return {};
  }
  return libraryVersion;
}

Json::Value makeDeviceMessage(const std::string &type,
                              std::uint64_t serverSequence,
                              const Json::Value &payload) {
  Json::Value message;
  message["protocol_version"] = kDeviceProtocolVersion;
  message["message_id"] = randomMessageId();
  message["type"] = type;
  message["sequence"] = std::to_string(serverSequence);
  message["timestamp"] = utcTimestamp();
  message["payload"] = payload.isObject() ? payload : Json::Value(Json::objectValue);
  return message;
}

Json::Value makeDeviceAck(std::uint64_t serverSequence,
                          const DeviceEnvelope &envelope,
                          bool duplicate) {
  Json::Value payload;
  payload["ack_message_id"] = envelope.messageId;
  payload["ack_sequence"] = std::to_string(envelope.sequence);
  payload["accepted_type"] = envelope.type;
  payload["duplicate"] = duplicate;
  return makeDeviceMessage("ack", serverSequence, payload);
}

Json::Value makeDeviceError(std::uint64_t serverSequence,
                            const std::string &code,
                            const std::string &message,
                            const std::string &messageId) {
  Json::Value payload;
  payload["code"] = code;
  payload["message"] = message;
  if (!messageId.empty()) payload["request_message_id"] = messageId;
  return makeDeviceMessage("error", serverSequence, payload);
}

}  // namespace roc::protocol