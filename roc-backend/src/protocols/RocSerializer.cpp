#include "protocols/RocSerializer.h"

#include <cstring>
#include <limits>
#include <stdexcept>

namespace roc::protocol {

namespace {

class PayloadReader {
 public:
  explicit PayloadReader(const std::vector<uint8_t> &data) : data_(data) {}

  bool readU16(uint16_t &value) {
    if (!canRead(2)) return false;
    value = (static_cast<uint16_t>(data_[offset_]) << 8) |
            static_cast<uint16_t>(data_[offset_ + 1]);
    offset_ += 2;
    return true;
  }

  bool readU32(uint32_t &value) {
    if (!canRead(4)) return false;
    value = (static_cast<uint32_t>(data_[offset_]) << 24) |
            (static_cast<uint32_t>(data_[offset_ + 1]) << 16) |
            (static_cast<uint32_t>(data_[offset_ + 2]) << 8) |
            static_cast<uint32_t>(data_[offset_ + 3]);
    offset_ += 4;
    return true;
  }

  bool readI32(int32_t &value) {
    uint32_t bits = 0;
    if (!readU32(bits)) return false;
    std::memcpy(&value, &bits, sizeof(value));
    return true;
  }

  bool readF64(double &value) {
    if (!canRead(8)) return false;
    uint64_t bits = 0;
    for (size_t i = 0; i < 8; ++i) {
      bits = (bits << 8) | data_[offset_ + i];
    }
    offset_ += 8;
    std::memcpy(&value, &bits, sizeof(value));
    return true;
  }

  bool readBool(bool &value) {
    if (!canRead(1)) return false;
    value = data_[offset_++] != 0;
    return true;
  }

  bool readString(std::string &value) {
    uint16_t length = 0;
    if (!readU16(length) || !canRead(length)) return false;
    if (length == 0) {
      value.clear();
    } else {
      value.assign(reinterpret_cast<const char *>(data_.data() + offset_), length);
    }
    offset_ += length;
    return true;
  }

  bool empty() const { return offset_ == data_.size(); }

 private:
  bool canRead(size_t length) const {
    return length <= data_.size() - offset_;
  }

  const std::vector<uint8_t> &data_;
  size_t offset_{0};
};

uint16_t headerU16(const std::vector<uint8_t> &data, size_t offset) {
  return (static_cast<uint16_t>(data[offset]) << 8) |
         static_cast<uint16_t>(data[offset + 1]);
}

uint32_t headerU32(const std::vector<uint8_t> &data, size_t offset) {
  return (static_cast<uint32_t>(data[offset]) << 24) |
         (static_cast<uint32_t>(data[offset + 1]) << 16) |
         (static_cast<uint32_t>(data[offset + 2]) << 8) |
         static_cast<uint32_t>(data[offset + 3]);
}

}  // namespace

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
  if (s.size() > std::numeric_limits<uint16_t>::max()) {
    throw std::length_error("ROC string exceeds uint16 length limit");
  }
  writeU16(buf, static_cast<uint16_t>(s.size()));
  buf.insert(buf.end(), s.begin(), s.end());
}

void RocSerializer::writeBool(std::vector<uint8_t> &buf, bool v) {
  buf.push_back(v ? 1 : 0);
}

// ---------- pack / unpack ----------

std::vector<uint8_t> RocSerializer::pack(RocMsgType type, const std::vector<uint8_t> &payload) {
  if (payload.size() > std::numeric_limits<uint32_t>::max()) {
    throw std::length_error("ROC payload exceeds uint32 length limit");
  }
  std::vector<uint8_t> buf;
  writeU32(buf, ROC_MAGIC);
  writeU16(buf, static_cast<uint16_t>(type));
  writeU32(buf, static_cast<uint32_t>(payload.size()));
  buf.insert(buf.end(), payload.begin(), payload.end());
  return buf;
}

std::optional<RocSerializer::UnpackResult> RocSerializer::unpack(const std::vector<uint8_t> &data) {
  if (data.size() < HEADER_SIZE) return std::nullopt;
  const uint32_t magic = headerU32(data, 0);
  if (magic != ROC_MAGIC) return std::nullopt;
  const uint16_t typeVal = headerU16(data, 4);
  const uint32_t len = headerU32(data, 6);
  if (static_cast<size_t>(len) != data.size() - HEADER_SIZE) return std::nullopt;
  UnpackResult r;
  r.type = static_cast<RocMsgType>(typeVal);
  r.payload.assign(data.begin() + HEADER_SIZE, data.end());
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
  PayloadReader reader(u->payload);
  RobotStatus s;
  if (!reader.readString(s.robot_id) || !reader.readBool(s.online) ||
      !reader.readF64(s.cpu_usage) || !reader.readF64(s.memory_usage) ||
      !reader.readI32(s.battery_level) ||
      !reader.readF64(s.localization_confidence) ||
      !reader.readF64(s.position_x) || !reader.readF64(s.position_y) ||
      !reader.readF64(s.position_theta) ||
      !reader.readF64(s.velocity_linear) ||
      !reader.readF64(s.velocity_angular) || !reader.empty()) {
    return std::nullopt;
  }
  s.timestamp = std::chrono::system_clock::now();
  return s;
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
  PayloadReader reader(u->payload);
  ControlCommand c;
  if (!reader.readString(c.robot_id) ||
      !reader.readString(c.command_type) ||
      !reader.readF64(c.linear_x) || !reader.readF64(c.linear_y) ||
      !reader.readF64(c.linear_z) || !reader.readF64(c.angular_x) ||
      !reader.readF64(c.angular_y) || !reader.readF64(c.angular_z) ||
      !reader.readString(c.task_params) || !reader.empty()) {
    return std::nullopt;
  }
  return c;
}

}  // namespace roc::protocol
