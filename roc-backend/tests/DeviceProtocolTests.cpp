#include "protocols/DeviceProtocol.h"

#include <cassert>
#include <iostream>
#include <string>

namespace {

const char *kMessageId = "123e4567-e89b-42d3-a456-426614174000";

std::string heartbeat() {
  return std::string("{") +
      "\"protocol_version\":1," +
      "\"message_id\":\"" + kMessageId + "\"," +
      "\"type\":\"heartbeat\"," +
      "\"sequence\":\"1\"," +
      "\"timestamp\":\"2026-09-16T12:00:00Z\"," +
      "\"payload\":{\"library_version\":\"0.1.0\"}}";
}

std::string telemetry() {
  return std::string("{") +
      "\"protocol_version\":1," +
      "\"message_id\":\"" + kMessageId + "\"," +
      "\"type\":\"telemetry\"," +
      "\"sequence\":\"2\"," +
      "\"timestamp\":\"2026-09-16T12:00:01Z\"," +
      "\"payload\":{" +
      "\"online\":true,\"cpu_usage\":12.5,\"memory_usage\":23.5," +
      "\"battery_level\":88,\"localization_confidence\":97.5," +
      "\"position\":{\"x\":1.25,\"y\":-2.5,\"theta\":0.5}," +
      "\"velocity\":{\"linear\":0.8,\"angular\":-0.1}}}";
}

}  // namespace

int main() {
  roc::protocol::DeviceProtocolError error;
  const auto heartbeatEnvelope =
      roc::protocol::parseDeviceEnvelope(heartbeat(), &error);
  assert(heartbeatEnvelope);
  assert(heartbeatEnvelope->sequence == 1);
  assert(roc::protocol::optionalLibraryVersion(*heartbeatEnvelope, &error) ==
         "0.1.0");

  error = {};
  const auto telemetryEnvelope =
      roc::protocol::parseDeviceEnvelope(telemetry(), &error);
  assert(telemetryEnvelope);
  const auto status = roc::protocol::telemetryFromEnvelope(
      *telemetryEnvelope, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", &error);
  assert(status);
  assert(status->robot_id == "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert(status->battery_level == 88);
  assert(status->position_y == -2.5);

  auto spoofed = heartbeat();
  const auto marker = spoofed.find("\"library_version\"");
  spoofed.insert(marker, "\"vehicle_id\":\"spoofed\",");
  error = {};
  assert(!roc::protocol::parseDeviceEnvelope(spoofed, &error));
  assert(error.code == "identity_not_allowed");

  auto unknownEnvelope = heartbeat();
  unknownEnvelope.insert(1, "\"extra\":true,");
  error = {};
  assert(!roc::protocol::parseDeviceEnvelope(unknownEnvelope, &error));
  assert(error.code == "unknown_field");

  auto unknownHeartbeat = heartbeat();
  const auto heartbeatPayload = unknownHeartbeat.find("\"library_version\"");
  unknownHeartbeat.insert(heartbeatPayload, "\"extra\":true,");
  error = {};
  assert(!roc::protocol::parseDeviceEnvelope(unknownHeartbeat, &error));
  assert(error.code == "unknown_field");

  auto unknownPosition = telemetry();
  const auto positionX = unknownPosition.find("\"x\":1.25");
  unknownPosition.insert(positionX, "\"z\":3.0,");
  error = {};
  const auto unknownPositionEnvelope =
      roc::protocol::parseDeviceEnvelope(unknownPosition, &error);
  assert(unknownPositionEnvelope);
  assert(!roc::protocol::telemetryFromEnvelope(
      *unknownPositionEnvelope, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", &error));
  assert(error.code == "invalid_telemetry");

  auto badLibrary = heartbeat();
  badLibrary.replace(badLibrary.find("0.1.0"), 5, "bad version");
  error = {};
  const auto badLibraryEnvelope =
      roc::protocol::parseDeviceEnvelope(badLibrary, &error);
  assert(badLibraryEnvelope);
  assert(roc::protocol::optionalLibraryVersion(*badLibraryEnvelope, &error).empty());
  assert(error.code == "invalid_library_version");

  auto badVersion = heartbeat();
  badVersion.replace(badVersion.find("\"protocol_version\":1"), 20,
                     "\"protocol_version\":2");
  error = {};
  assert(!roc::protocol::parseDeviceEnvelope(badVersion, &error));
  assert(error.code == "unsupported_protocol_version");

  const auto ack = roc::protocol::makeDeviceAck(7, *heartbeatEnvelope, false);
  assert(ack["protocol_version"].asInt() == 1);
  assert(ack["type"].asString() == "ack");
  assert(ack["sequence"].asString() == "7");
  assert(ack["payload"]["ack_sequence"].asString() == "1");

  std::cout << "DeviceProtocolTests passed\n";
  return 0;
}