#include "protocols/RocSerializer.h"

#include <cstring>
#include <stdexcept>

namespace roc::protocol {

// ---------- helpers ----------

void RocSerializer::writeU32(std::vector<uint8_t> &buf, uint32_t v) {
  buf.push_back(static_cast<uint8_t>((v >> 24) & 0xFF));
  buf.push_back(static_cast<uint8_t>((v >> 16) & 0xFF));
  buf.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
  buf.push_back(static_cast<uint8_t>(v & 0xFF));
}

void RocSerializer::writeU16(std::vector<uint8_t> &buf, uint16_t v) {
  buf.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
  buf.push_back(static_cast<uint8_t>(v & 0xFF));
}

void RocSerializer::writeF64(std::vector<uint8_t> &buf, double v) {
  uint64_t bits;
  std::memcpy(&bits, &v, sizeof(bits));
  for (int i = 7; i >= 0; --i) buf.push_back(static_cast<uint8_t>((bits >> (i * 8)) & 0xFF));
}

void RocSerializer::writeI32(std::vector<uint8_t> &buf, int32_t v) {
  uint32_t u;
  std::memcpy(&u, &v, sizeof(u));
  writeU32(buf, u);
}

void RocSerializer::writeStr(std::vector<uint8_t> &buf, const std::string &s) {
  writeU16(buf, static_cast<uint16_t>(s.size()));
  buf.insert(buf.end(), s.begin(), s.end());
}

void RocSerializer::writeBool(std::vector<uint8_t> &buf, bool v) {
  buf.push_back(v ? 1 : 0);
}

uint32_t RocSerializer::readU32(const uint8_t *&p) {
  uint32_t v = (static_cast<uint32_t>(p[0]) << 24) | (static_cast<uint32_t>(p[1]) << 16) |
               (static_cast<uint32_t>(p[2]) << 8) | static_cast<uint32_t>(p[3]);
  p += 4;
  return v;
}

uint16_t RocSerializer::readU16(const uint8_t *&p) {
  uint16_t v = (static_cast<uint16_t>(p[0]) << 8) | static_cast<uint16_t>(p[1]);
  p += 2;
  return v;
}

double RocSerializer::readF64(const uint8_t *&p) {
  uint64_t bits = 0;
  for (int i = 0; i < 8; ++i) bits = (bits << 8) | p[i];
  p += 8;
  double v;
  std::memcpy(&v, &bits, sizeof(v));
  return v;
}

int32_t RocSerializer::readI32(const uint8_t *&p) {
  return static_cast<int32_t>(readU32(p));
}

std::string RocSerializer::readStr(const uint8_t *&p) {
  uint16_t len = readU16(p);
  std::string s(reinterpret_cast<const char *>(p), len);
  p += len;
  return s;
}

bool RocSerializer::readBool(const uint8_t *&p) {
  return *(p++) != 0;
}

// ---------- pack / unpack ----------

std::vector<uint8_t> RocSerializer::pack(RocMsgType type, const std::vector<uint8_t> &payload) {
  std::vector<uint8_t> buf;
  writeU32(buf, ROC_MAGIC);
  writeU16(buf, static_cast<uint16_t>(type));
  writeU32(buf, static_cast<uint32_t>(payload.size()));
  buf.insert(buf.end(), payload.begin(), payload.end());
  return buf;
}

std::optional<RocSerializer::UnpackResult> RocSerializer::unpack(const std::vector<uint8_t> &data) {
  if (data.size() < HEADER_SIZE) return std::nullopt;
  const uint8_t *p = data.data();
  uint32_t magic = readU32(p);
  if (magic != ROC_MAGIC) return std::nullopt;
  uint16_t typeVal = readU16(p);
  uint32_t len = readU32(p);
  if (data.size() < HEADER_SIZE + len) return std::nullopt;
  UnpackResult r;
  r.type = static_cast<RocMsgType>(typeVal);
  r.payload = std::vector<uint8_t>(p, p + len);
  return r;
}

// ---------- serialize / deserialize ----------

std::vector<uint8_t> RocSerializer::serializeStatus(const RobotStatus &s) {
  std::vector<uint8_t> payload;
  writeStr(payload, s.robot_id);
  writeBool(payload, s.online);
  writeF64(payload, s.cpu_usage);
  writeF64(payload, s.memory_usage);
  writeI32(payload, s.battery_level);
  writeF64(payload, s.localization_confidence);
  writeF64(payload, s.position_x);
  writeF64(payload, s.position_y);
  writeF64(payload, s.position_theta);
  writeF64(payload, s.velocity_linear);
  writeF64(payload, s.velocity_angular);
  return pack(RocMsgType::STATUS_REPORT, payload);
}

std::optional<RobotStatus> RocSerializer::deserializeStatus(const std::vector<uint8_t> &data) {
  auto u = unpack(data);
  if (!u || u->type != RocMsgType::STATUS_REPORT) return std::nullopt;
  const uint8_t *p = u->payload.data();
  const uint8_t *end = p + u->payload.size();
  try {
    RobotStatus s;
    s.robot_id = readStr(p);
    s.online = readBool(p);
    s.cpu_usage = readF64(p);
    s.memory_usage = readF64(p);
    s.battery_level = readI32(p);
    s.localization_confidence = readF64(p);
    s.position_x = readF64(p);
    s.position_y = readF64(p);
    s.position_theta = readF64(p);
    s.velocity_linear = readF64(p);
    s.velocity_angular = readF64(p);
    s.timestamp = std::chrono::system_clock::now();
    if (p > end) return std::nullopt;
    return s;
  } catch (...) {
    return std::nullopt;
  }
}

std::vector<uint8_t> RocSerializer::serializeCommand(const ControlCommand &c) {
  std::vector<uint8_t> payload;
  writeStr(payload, c.robot_id);
  writeStr(payload, c.command_type);
  writeF64(payload, c.linear_x);
  writeF64(payload, c.linear_y);
  writeF64(payload, c.linear_z);
  writeF64(payload, c.angular_x);
  writeF64(payload, c.angular_y);
  writeF64(payload, c.angular_z);
  writeStr(payload, c.task_params);
  return pack(RocMsgType::CONTROL_CMD, payload);
}

std::optional<ControlCommand> RocSerializer::deserializeCommand(const std::vector<uint8_t> &data) {
  auto u = unpack(data);
  if (!u || u->type != RocMsgType::CONTROL_CMD) return std::nullopt;
  const uint8_t *p = u->payload.data();
  const uint8_t *end = p + u->payload.size();
  try {
    ControlCommand c;
    c.robot_id = readStr(p);
    c.command_type = readStr(p);
    c.linear_x = readF64(p);
    c.linear_y = readF64(p);
    c.linear_z = readF64(p);
    c.angular_x = readF64(p);
    c.angular_y = readF64(p);
    c.angular_z = readF64(p);
    c.task_params = readStr(p);
    if (p > end) return std::nullopt;
    return c;
  } catch (...) {
    return std::nullopt;
  }
}

}  // namespace roc::protocol
