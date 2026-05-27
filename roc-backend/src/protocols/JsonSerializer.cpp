#include "protocols/JsonSerializer.h"

#include <json/json.h>
#include <chrono>
#include <sstream>

namespace roc::protocol {

static double nowSeconds() {
  auto now = std::chrono::system_clock::now();
  return std::chrono::duration<double>(now.time_since_epoch()).count();
}

Json::Value JsonSerializer::statusToJson(const RobotStatus &s) {
  Json::Value j;
  j["robot_id"] = s.robot_id;
  j["online"] = s.online;
  j["cpu_usage"] = s.cpu_usage;
  j["memory_usage"] = s.memory_usage;
  j["battery_level"] = s.battery_level;
  j["localization_confidence"] = s.localization_confidence;
  j["position"]["x"] = s.position_x;
  j["position"]["y"] = s.position_y;
  j["position"]["theta"] = s.position_theta;
  j["velocity"]["linear"] = s.velocity_linear;
  j["velocity"]["angular"] = s.velocity_angular;
  j["timestamp"] = nowSeconds();
  return j;
}

RobotStatus JsonSerializer::jsonToStatus(const Json::Value &j) {
  RobotStatus s;
  s.robot_id = j.get("robot_id", "").asString();
  s.online = j.get("online", false).asBool();
  s.cpu_usage = j.get("cpu_usage", 0.0).asDouble();
  s.memory_usage = j.get("memory_usage", 0.0).asDouble();
  s.battery_level = j.get("battery_level", 100).asInt();
  s.localization_confidence = j.get("localization_confidence", 0.0).asDouble();
  s.position_x = j["position"].get("x", 0.0).asDouble();
  s.position_y = j["position"].get("y", 0.0).asDouble();
  s.position_theta = j["position"].get("theta", 0.0).asDouble();
  s.velocity_linear = j["velocity"].get("linear", 0.0).asDouble();
  s.velocity_angular = j["velocity"].get("angular", 0.0).asDouble();
  s.timestamp = std::chrono::system_clock::now();
  return s;
}

Json::Value JsonSerializer::commandToJson(const ControlCommand &c) {
  Json::Value j;
  j["robot_id"] = c.robot_id;
  j["command_type"] = c.command_type;
  j["linear_x"] = c.linear_x;
  j["linear_y"] = c.linear_y;
  j["linear_z"] = c.linear_z;
  j["angular_x"] = c.angular_x;
  j["angular_y"] = c.angular_y;
  j["angular_z"] = c.angular_z;
  j["task_params"] = c.task_params;
  return j;
}

ControlCommand JsonSerializer::jsonToCommand(const Json::Value &j) {
  ControlCommand c;
  c.robot_id = j.get("robot_id", "").asString();
  c.command_type = j.get("command_type", "").asString();
  c.linear_x = j.get("linear_x", 0.0).asDouble();
  c.linear_y = j.get("linear_y", 0.0).asDouble();
  c.linear_z = j.get("linear_z", 0.0).asDouble();
  c.angular_x = j.get("angular_x", 0.0).asDouble();
  c.angular_y = j.get("angular_y", 0.0).asDouble();
  c.angular_z = j.get("angular_z", 0.0).asDouble();
  c.task_params = j.get("task_params", "").asString();
  return c;
}

std::vector<uint8_t> JsonSerializer::serializeStatus(const RobotStatus &status) {
  Json::Value j = statusToJson(status);
  Json::StreamWriterBuilder w;
  w["indentation"] = "";
  std::string s = Json::writeString(w, j);
  return std::vector<uint8_t>(s.begin(), s.end());
}

std::optional<RobotStatus> JsonSerializer::deserializeStatus(const std::vector<uint8_t> &data) {
  std::string s(data.begin(), data.end());
  Json::Value j;
  Json::CharReaderBuilder r;
  std::string errs;
  std::istringstream iss(s);
  if (!Json::parseFromStream(r, iss, &j, &errs)) return std::nullopt;
  return jsonToStatus(j);
}

std::vector<uint8_t> JsonSerializer::serializeCommand(const ControlCommand &cmd) {
  Json::Value j = commandToJson(cmd);
  Json::StreamWriterBuilder w;
  w["indentation"] = "";
  std::string s = Json::writeString(w, j);
  return std::vector<uint8_t>(s.begin(), s.end());
}

std::optional<ControlCommand> JsonSerializer::deserializeCommand(const std::vector<uint8_t> &data) {
  std::string s(data.begin(), data.end());
  Json::Value j;
  Json::CharReaderBuilder r;
  std::string errs;
  std::istringstream iss(s);
  if (!Json::parseFromStream(r, iss, &j, &errs)) return std::nullopt;
  return jsonToCommand(j);
}

}  // namespace roc::protocol
