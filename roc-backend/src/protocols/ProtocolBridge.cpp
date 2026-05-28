#include "protocols/ProtocolBridge.h"
#include "protocols/JsonSerializer.h"
#include "protocols/RocSerializer.h"

#include <drogon/drogon.h>

namespace roc::protocol {

ProtocolBridge::ProtocolBridge()
    : jsonSerializer_(std::make_unique<JsonSerializer>())
    , rocSerializer_(std::make_unique<RocSerializer>()) {}

bool ProtocolBridge::ingest(const std::vector<uint8_t> &data, ProtocolType hint) {
  // Try the hinted protocol first
  IProtocolSerializer *ser = serializer(hint);
  if (ser) {
    auto status = ser->deserializeStatus(data);
    if (status) {
      for (auto &cb : statusCallbacks_) cb(*status);
      return true;
    }
    auto cmd = ser->deserializeCommand(data);
    if (cmd) {
      for (auto &cb : commandCallbacks_) cb(*cmd);
      return true;
    }
  }

  // Fallback: try ROC if hint was JSON
  if (hint == ProtocolType::JSON) {
    auto status = rocSerializer_->deserializeStatus(data);
    if (status) {
      for (auto &cb : statusCallbacks_) cb(*status);
      return true;
    }
    auto cmd = rocSerializer_->deserializeCommand(data);
    if (cmd) {
      for (auto &cb : commandCallbacks_) cb(*cmd);
      return true;
    }
  }

  // Fallback: try JSON if hint was ROC
  if (hint == ProtocolType::ROC) {
    auto status = jsonSerializer_->deserializeStatus(data);
    if (status) {
      for (auto &cb : statusCallbacks_) cb(*status);
      return true;
    }
  }

  return false;
}

std::vector<uint8_t> ProtocolBridge::serializeStatus(const RobotStatus &s, ProtocolType proto) {
  auto *ser = serializer(proto);
  if (!ser) return {};
  return ser->serializeStatus(s);
}

std::vector<uint8_t> ProtocolBridge::serializeCommand(const ControlCommand &c, ProtocolType proto) {
  auto *ser = serializer(proto);
  if (!ser) return {};
  return ser->serializeCommand(c);
}

void ProtocolBridge::onStatusReport(StatusCallback cb) {
  statusCallbacks_.push_back(std::move(cb));
}

void ProtocolBridge::onControlCommand(CommandCallback cb) {
  commandCallbacks_.push_back(std::move(cb));
}

IProtocolSerializer *ProtocolBridge::serializer(ProtocolType proto) {
  switch (proto) {
    case ProtocolType::JSON: return jsonSerializer_.get();
    case ProtocolType::ROC:  return rocSerializer_.get();
  }
  return nullptr;
}

}  // namespace roc::protocol
