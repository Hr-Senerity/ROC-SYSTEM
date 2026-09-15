#include "services/VehicleStatusService.h"

#include <cmath>
#include <sstream>
#include <vector>

#include "db/PostgresClient.h"
#include "utils/InputValidation.h"

namespace roc::service {
namespace {

constexpr const char *kVehicleColumns =
    "id, user_id, project_id, map_id, name, ip, status, cpu, memory, battery, "
    "localization_confidence, position_x, position_y, position_theta, "
    "velocity_linear, velocity_angular, delivery_path, last_heartbeat, "
    "telemetry_version::text AS version, received_at, created_at";

std::string numberText(double value) {
  std::ostringstream output;
  output.precision(17);
  output << value;
  return output.str();
}

bool validPercent(double value) {
  return std::isfinite(value) && value >= 0.0 && value <= 100.0;
}

}  // namespace

std::optional<Json::Value> VehicleStatusService::applyStatus(
    const std::string &connStr,
    const roc::protocol::RobotStatus &status,
    std::string *error) {
  if (!roc::utils::isUuid(status.robot_id)) {
    if (error) *error = "robot_id must be the registered vehicle UUID";
    return std::nullopt;
  }
  if (!validPercent(status.cpu_usage) || !validPercent(status.memory_usage) ||
      status.battery_level < 0 || status.battery_level > 100 ||
      !validPercent(status.localization_confidence) ||
      !std::isfinite(status.position_x) || !std::isfinite(status.position_y) ||
      !std::isfinite(status.position_theta) ||
      !std::isfinite(status.velocity_linear) ||
      !std::isfinite(status.velocity_angular)) {
    if (error) *error = "telemetry contains an invalid numeric value";
    return std::nullopt;
  }

  roc::db::PostgresClient pg(connStr);
  const auto updated = pg.executeParams(
      "UPDATE vehicles SET status = $1, cpu = $2::double precision, "
      "memory = $3::double precision, battery = $4::double precision, "
      "localization_confidence = $5::double precision, "
      "position_x = $6::double precision, position_y = $7::double precision, "
      "position_theta = $8::double precision, velocity_linear = $9::double precision, "
      "velocity_angular = $10::double precision, last_heartbeat = NOW(), "
      "received_at = NOW(), telemetry_version = telemetry_version + 1 "
      "WHERE id = $11::uuid",
      {status.online ? "online" : "offline", numberText(status.cpu_usage),
       numberText(status.memory_usage), std::to_string(status.battery_level),
       numberText(status.localization_confidence), numberText(status.position_x),
       numberText(status.position_y), numberText(status.position_theta),
       numberText(status.velocity_linear), numberText(status.velocity_angular),
       status.robot_id});
  if (updated != 1) {
    if (error) *error = "vehicle is not registered";
    return std::nullopt;
  }

  auto vehicle = pg.queryOneParams(
      std::string("SELECT ") + kVehicleColumns +
          " FROM vehicles WHERE id = $1::uuid",
      {status.robot_id});
  if (vehicle.isNull()) {
    if (error) *error = "updated vehicle could not be read";
    return std::nullopt;
  }
  return vehicle;
}

}  // namespace roc::service
