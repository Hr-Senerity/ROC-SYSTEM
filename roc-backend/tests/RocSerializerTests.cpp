#include "protocols/RocSerializer.h"

#include <cstdint>
#include <exception>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

int failures = 0;

void expect(bool condition, const std::string &name) {
  if (condition) return;
  std::cerr << "FAIL " << name << '\n';
  ++failures;
}

std::string toHex(const std::vector<uint8_t> &bytes) {
  std::ostringstream output;
  output << std::hex << std::setfill('0');
  for (const auto byte : bytes) output << std::setw(2) << static_cast<int>(byte);
  return output.str();
}

void setPayloadLength(std::vector<uint8_t> &frame, uint32_t length) {
  frame[6] = static_cast<uint8_t>((length >> 24) & 0xff);
  frame[7] = static_cast<uint8_t>((length >> 16) & 0xff);
  frame[8] = static_cast<uint8_t>((length >> 8) & 0xff);
  frame[9] = static_cast<uint8_t>(length & 0xff);
}

std::vector<uint8_t> payloadPrefix(const std::vector<uint8_t> &frame,
                                   size_t payloadBytes) {
  auto prefix = std::vector<uint8_t>(
      frame.begin(), frame.begin() + roc::protocol::RocSerializer::HEADER_SIZE + payloadBytes);
  setPayloadLength(prefix, static_cast<uint32_t>(payloadBytes));
  return prefix;
}

roc::protocol::RobotStatus sampleStatus() {
  roc::protocol::RobotStatus status{};
  status.robot_id = "r";
  status.online = true;
  status.cpu_usage = 1.0;
  status.memory_usage = 2.0;
  status.battery_level = 3;
  status.localization_confidence = 4.0;
  status.position_x = 5.0;
  status.position_y = 6.0;
  status.position_theta = 7.0;
  status.velocity_linear = 8.0;
  status.velocity_angular = 9.0;
  return status;
}

roc::protocol::ControlCommand sampleCommand() {
  roc::protocol::ControlCommand command{};
  command.robot_id = "vehicle";
  command.command_type = "move";
  command.linear_x = 1.0;
  command.linear_y = 2.0;
  command.linear_z = 3.0;
  command.angular_x = 4.0;
  command.angular_y = 5.0;
  command.angular_z = 6.0;
  command.task_params = R"({"task_id":"golden"})";
  return command;
}

void testStatusGoldenAndRoundTrip() {
  roc::protocol::RocSerializer serializer;
  const auto frame = serializer.serializeStatus(sampleStatus());
  const std::string expected =
      "524f432000010000004800017201"
      "3ff0000000000000"
      "4000000000000000"
      "00000003"
      "4010000000000000"
      "4014000000000000"
      "4018000000000000"
      "401c000000000000"
      "4020000000000000"
      "4022000000000000";
  expect(toHex(frame) == expected, "status golden frame");

  const auto decoded = serializer.deserializeStatus(frame);
  expect(decoded.has_value(), "status round trip decodes");
  if (!decoded) return;
  expect(decoded->robot_id == "r", "status robot_id");
  expect(decoded->online, "status online");
  expect(decoded->cpu_usage == 1.0 && decoded->memory_usage == 2.0,
         "status resource metrics");
  expect(decoded->battery_level == 3 && decoded->localization_confidence == 4.0,
         "status battery and localization");
  expect(decoded->position_x == 5.0 && decoded->position_y == 6.0 &&
             decoded->position_theta == 7.0,
         "status position");
  expect(decoded->velocity_linear == 8.0 && decoded->velocity_angular == 9.0,
         "status velocity");
}

void testStatusRejectsMalformedFrames() {
  roc::protocol::RocSerializer serializer;
  const auto frame = serializer.serializeStatus(sampleStatus());
  const size_t payloadSize = frame.size() - roc::protocol::RocSerializer::HEADER_SIZE;

  for (size_t size = 0; size < roc::protocol::RocSerializer::HEADER_SIZE; ++size) {
    expect(!serializer.deserializeStatus(
                std::vector<uint8_t>(frame.begin(), frame.begin() + size)),
           "status truncated header " + std::to_string(size));
  }
  for (size_t size = 0; size < payloadSize; ++size) {
    expect(!serializer.deserializeStatus(payloadPrefix(frame, size)),
           "status truncated payload " + std::to_string(size));
  }

  auto badMagic = frame;
  badMagic[0] ^= 0xff;
  expect(!serializer.deserializeStatus(badMagic), "status bad magic");

  auto wrongType = frame;
  wrongType[4] = 0;
  wrongType[5] = 2;
  expect(!serializer.deserializeStatus(wrongType), "status wrong message type");

  auto declaredTooLarge = frame;
  setPayloadLength(declaredTooLarge, static_cast<uint32_t>(payloadSize + 1));
  expect(!serializer.deserializeStatus(declaredTooLarge), "status declared length too large");

  auto declaredMax = frame;
  setPayloadLength(declaredMax, 0xffffffffu);
  expect(!serializer.deserializeStatus(declaredMax), "status maximum forged length");

  auto trailingOutsideFrame = frame;
  trailingOutsideFrame.push_back(0);
  expect(!serializer.deserializeStatus(trailingOutsideFrame), "status trailing byte outside length");

  auto trailingInsidePayload = frame;
  trailingInsidePayload.push_back(0);
  setPayloadLength(trailingInsidePayload, static_cast<uint32_t>(payloadSize + 1));
  expect(!serializer.deserializeStatus(trailingInsidePayload), "status trailing payload byte");

  auto forgedStringLength = payloadPrefix(frame, 3);
  forgedStringLength[10] = 0xff;
  forgedStringLength[11] = 0xff;
  expect(!serializer.deserializeStatus(forgedStringLength), "status forged string length");
}

void testCommandRoundTripAndBounds() {
  roc::protocol::RocSerializer serializer;
  const auto command = sampleCommand();
  const auto frame = serializer.serializeCommand(command);
  const auto decoded = serializer.deserializeCommand(frame);
  expect(decoded.has_value(), "command round trip decodes");
  if (decoded) {
    expect(decoded->robot_id == command.robot_id &&
               decoded->command_type == command.command_type &&
               decoded->linear_x == command.linear_x &&
               decoded->linear_y == command.linear_y &&
               decoded->linear_z == command.linear_z &&
               decoded->angular_x == command.angular_x &&
               decoded->angular_y == command.angular_y &&
               decoded->angular_z == command.angular_z &&
               decoded->task_params == command.task_params,
           "command round trip fields");
  }

  const size_t payloadSize = frame.size() - roc::protocol::RocSerializer::HEADER_SIZE;
  for (size_t size = 0; size < payloadSize; ++size) {
    expect(!serializer.deserializeCommand(payloadPrefix(frame, size)),
           "command truncated payload " + std::to_string(size));
  }

  auto trailing = frame;
  trailing.push_back(0);
  setPayloadLength(trailing, static_cast<uint32_t>(payloadSize + 1));
  expect(!serializer.deserializeCommand(trailing), "command trailing payload byte");
  expect(!serializer.deserializeStatus(frame), "command rejected as status");
}

void testOversizedStringRejected() {
  roc::protocol::RocSerializer serializer;
  auto command = sampleCommand();
  command.task_params.assign(65536, 'x');
  bool threw = false;
  try {
    (void)serializer.serializeCommand(command);
  } catch (const std::length_error &) {
    threw = true;
  } catch (...) {
  }
  expect(threw, "oversized string rejected");
}

}  // namespace

int main() {
  testStatusGoldenAndRoundTrip();
  testStatusRejectsMalformedFrames();
  testCommandRoundTripAndBounds();
  testOversizedStringRejected();
  if (failures != 0) {
    std::cerr << failures << " ROC serializer test(s) failed\n";
    return 1;
  }
  std::cout << "PASS ROC serializer golden and malformed frame tests\n";
  return 0;
}
