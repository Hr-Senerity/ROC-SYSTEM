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

VehicleUpdateResult duplicateOrUnauthorized(
    const roc::db::PostgresClient &postgres,
    const std::string &vehicleId,
    const std::string &deviceTokenHash,
    std::uint64_t clientSequence) {
  const auto vehicle = postgres.queryOneParams(
      std::string("SELECT ") + kVehicleColumns +
          ", device_last_sequence::text AS device_last_sequence "
          "FROM vehicles WHERE id = $1::uuid AND device_enabled = true "
          "AND device_token_hash = $2",
      {vehicleId, deviceTokenHash});
  if (vehicle.isNull()) {
    return {VehicleUpdateOutcome::Unauthorized,
            Json::Value(Json::nullValue),
            "Device token was rotated, revoked, or disabled"};
  }

  try {
    const auto stored = std::stoull(vehicle["device_last_sequence"].asString());
    if (clientSequence <= stored) {
      return {VehicleUpdateOutcome::Duplicate, vehicle, {}};
    }
  } catch (...) {
    return {VehicleUpdateOutcome::Rejected,
            Json::Value(Json::nullValue),
            "stored device sequence is invalid"};
  }
  return {VehicleUpdateOutcome::Rejected,
          Json::Value(Json::nullValue),
          "device sequence update was rejected"};
}

std::optional<Json::Value> updateConnectionState(
    const std::string &connStr,
    const std::string &vehicleId,
    const std::string &deviceTokenHash,
    bool connected) {
  if (!roc::utils::isUuid(vehicleId) || deviceTokenHash.empty()) {
    return std::nullopt;
  }
  roc::db::PostgresClient postgres(connStr);
  const auto result = postgres.queryOneParams(
      std::string("UPDATE vehicles SET status = $1, received_at = NOW(), ") +
          (connected
               ? "last_heartbeat = NOW(), device_connected_at = NOW(), "
               : "device_disconnected_at = NOW(), ") +
          "telemetry_version = telemetry_version + 1 "
          "WHERE id = $2::uuid AND device_enabled = true "
          "AND device_token_hash = $3 RETURNING " + kVehicleColumns,
      {connected ? "online" : "offline", vehicleId, deviceTokenHash});
  if (result.isNull()) return std::nullopt;
  return result;
}

}  // namespace

VehicleUpdateResult VehicleStatusService::applyTelemetry(
    const std::string &connStr,
    const roc::protocol::RobotStatus &status,
    std::uint64_t clientSequence,
    int protocolVersion,
    const std::string &libraryVersion,
    const std::string &deviceTokenHash) {
  if (!roc::utils::isUuid(status.robot_id)) {
    return {VehicleUpdateOutcome::Rejected,
            Json::Value(Json::nullValue),
            "vehicle identity is invalid"};
  }
  if (clientSequence == 0 || protocolVersion != 1 ||
      deviceTokenHash.empty()) {
    return {VehicleUpdateOutcome::Rejected,
            Json::Value(Json::nullValue),
            "device protocol sequence, version, or credential is invalid"};
  }
  if (!validPercent(status.cpu_usage) || !validPercent(status.memory_usage) ||
      status.battery_level < 0 || status.battery_level > 100 ||
      !validPercent(status.localization_confidence) ||
      !std::isfinite(status.position_x) || !std::isfinite(status.position_y) ||
      !std::isfinite(status.position_theta) ||
      !std::isfinite(status.velocity_linear) ||
      !std::isfinite(status.velocity_angular)) {
    return {VehicleUpdateOutcome::Rejected,
            Json::Value(Json::nullValue),
            "telemetry contains an invalid numeric value"};
  }

  roc::db::PostgresClient postgres(connStr);
  const auto updated = postgres.queryOneParams(
      std::string("UPDATE vehicles SET status = $1, cpu = $2::double precision, ") +
          "memory = $3::double precision, battery = $4::double precision, "
          "localization_confidence = $5::double precision, "
          "position_x = $6::double precision, position_y = $7::double precision, "
          "position_theta = $8::double precision, "
          "velocity_linear = $9::double precision, "
          "velocity_angular = $10::double precision, last_heartbeat = NOW(), "
          "received_at = NOW(), telemetry_version = telemetry_version + 1, "
          "device_protocol_version = $11::integer, "
          "device_library_version = NULLIF($12, ''), "
          "device_last_sequence = $13::bigint "
          "WHERE id = $14::uuid AND device_enabled = true "
          "AND device_token_hash = $15 "
          "AND device_last_sequence < $13::bigint RETURNING " +
          kVehicleColumns,
      {status.online ? "online" : "offline", numberText(status.cpu_usage),
       numberText(status.memory_usage), std::to_string(status.battery_level),
       numberText(status.localization_confidence), numberText(status.position_x),
       numberText(status.position_y), numberText(status.position_theta),
       numberText(status.velocity_linear), numberText(status.velocity_angular),
       std::to_string(protocolVersion), libraryVersion,
       std::to_string(clientSequence), status.robot_id, deviceTokenHash});
  if (updated.isNull()) {
    return duplicateOrUnauthorized(
        postgres, status.robot_id, deviceTokenHash, clientSequence);
  }
  return {VehicleUpdateOutcome::Applied, updated, {}};
}

VehicleUpdateResult VehicleStatusService::applyHeartbeat(
    const std::string &connStr,
    const std::string &vehicleId,
    std::uint64_t clientSequence,
    int protocolVersion,
    const std::string &libraryVersion,
    const std::string &deviceTokenHash) {
  if (!roc::utils::isUuid(vehicleId) || clientSequence == 0 ||
      protocolVersion != 1 || deviceTokenHash.empty()) {
    return {VehicleUpdateOutcome::Rejected,
            Json::Value(Json::nullValue),
            "device heartbeat identity, sequence, version, or credential is invalid"};
  }

  roc::db::PostgresClient postgres(connStr);
  const auto updated = postgres.queryOneParams(
      std::string("UPDATE vehicles SET status = 'online', last_heartbeat = NOW(), ") +
          "received_at = NOW(), telemetry_version = telemetry_version + 1, "
          "device_protocol_version = $1::integer, "
          "device_library_version = NULLIF($2, ''), "
          "device_last_sequence = $3::bigint "
          "WHERE id = $4::uuid AND device_enabled = true "
          "AND device_token_hash = $5 "
          "AND device_last_sequence < $3::bigint RETURNING " +
          kVehicleColumns,
      {std::to_string(protocolVersion), libraryVersion,
       std::to_string(clientSequence), vehicleId, deviceTokenHash});
  if (updated.isNull()) {
    return duplicateOrUnauthorized(
        postgres, vehicleId, deviceTokenHash, clientSequence);
  }
  return {VehicleUpdateOutcome::Applied, updated, {}};
}

std::optional<Json::Value> VehicleStatusService::markConnected(
    const std::string &connStr,
    const std::string &vehicleId,
    const std::string &deviceTokenHash) {
  return updateConnectionState(
      connStr, vehicleId, deviceTokenHash, true);
}

std::optional<Json::Value> VehicleStatusService::markDisconnected(
    const std::string &connStr,
    const std::string &vehicleId,
    const std::string &deviceTokenHash) {
  return updateConnectionState(
      connStr, vehicleId, deviceTokenHash, false);
}

}  // namespace roc::service
