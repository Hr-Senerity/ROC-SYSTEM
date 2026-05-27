#pragma once

#include "protocols/ProtocolSerializer.h"

namespace roc::protocol {

// ROC Binary Protocol (as described in protocols/roc/README.md)
// Header: 4-byte magic (0x524F4320 = "ROC "), 2-byte msgType, 4-byte length, N-byte payload
class RocSerializer : public IProtocolSerializer {
 public:
  static constexpr uint32_t ROC_MAGIC = 0x524F4320;  // "ROC "
  static constexpr size_t HEADER_SIZE = 10;           // 4 + 2 + 4

  std::vector<uint8_t> serializeStatus(const RobotStatus &status) override;
  std::optional<RobotStatus> deserializeStatus(const std::vector<uint8_t> &data) override;

  std::vector<uint8_t> serializeCommand(const ControlCommand &cmd) override;
  std::optional<ControlCommand> deserializeCommand(const std::vector<uint8_t> &data) override;

  ProtocolType protocolType() const override { return ProtocolType::ROC; }

 private:
  enum class RocMsgType : uint16_t {
    STATUS_REPORT = 0x01,
    CONTROL_CMD = 0x02,
    HEARTBEAT = 0x03,
  };

  std::vector<uint8_t> pack(RocMsgType type, const std::vector<uint8_t> &payload);
  struct UnpackResult {
    RocMsgType type;
    std::vector<uint8_t> payload;
  };
  std::optional<UnpackResult> unpack(const std::vector<uint8_t> &data);

  void writeU32(std::vector<uint8_t> &buf, uint32_t v);
  void writeU16(std::vector<uint8_t> &buf, uint16_t v);
  void writeF64(std::vector<uint8_t> &buf, double v);
  void writeI32(std::vector<uint8_t> &buf, int32_t v);
  void writeStr(std::vector<uint8_t> &buf, const std::string &s);
  void writeBool(std::vector<uint8_t> &buf, bool v);

  uint32_t readU32(const uint8_t *&p);
  uint16_t readU16(const uint8_t *&p);
  double readF64(const uint8_t *&p);
  int32_t readI32(const uint8_t *&p);
  std::string readStr(const uint8_t *&p);
  bool readBool(const uint8_t *&p);
};

}  // namespace roc::protocol
