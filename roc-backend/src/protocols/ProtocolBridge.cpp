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
      for (auto &cb : statusCallbacks_) {
        if (!cb(*status)) return false;
      }
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
      for (auto &cb : statusCallbacks_) {
        if (!cb(*status)) return false;
      }
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
      for (auto &cb : statusCallbacks_) {
        if (!cb(*status)) return false;
      }
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

void ProtocolBridge::enqueueCommand(const ControlCommand &cmd, ProtocolType proto) {
  auto *ser = serializer(proto);
  if (!ser) return;
  auto data = ser->serializeCommand(cmd);
  std::string s(data.begin(), data.end());
  std::lock_guard<std::mutex> lock(mutex_);
  pendingCommands_[cmd.robot_id].push_back(s);
}

std::vector<std::string> ProtocolBridge::pollCommands(const std::string &robotId) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = pendingCommands_.find(robotId);
  if (it == pendingCommands_.end()) return {};
  auto cmds = std::move(it->second);
  pendingCommands_.erase(it);
  return cmds;
}

void ProtocolBridge::enqueueStatusResponse(const std::string &robotId, const std::string &json) {
  std::lock_guard<std::mutex> lock(mutex_);
  pendingCommands_[robotId].push_back(json);
}

}  // namespace roc::protocol
