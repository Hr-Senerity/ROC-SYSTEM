#include "services/DeploymentService.h"

#include <algorithm>
#include <chrono>
#include <ctime>
#include <set>
#include <sstream>
#include <stdexcept>
#include <utility>

#include <pqxx/pqxx>

#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::service {
namespace {

constexpr int kLeaseSeconds = 30 * 60;

DeploymentResult fail(int status, const std::string &code,
                      const std::string &message) {
  DeploymentResult result;
  result.status = status;
  result.body["ok"] = false;
  result.body["code"] = code;
  result.body["message"] = message;
  return result;
}

Json::Value parseJson(const std::string &text) {
  Json::Value value;
  Json::CharReaderBuilder reader;
  std::string error;
  std::istringstream input(text);
  if (!Json::parseFromStream(reader, input, &value, &error)) {
    throw std::runtime_error("Stored resource JSON is invalid");
  }
  return value;
}

std::string value(const pqxx::row &row, const char *name) {
  return row[name].is_null() ? std::string{} : row[name].as<std::string>();
}

Json::Value taskJson(const pqxx::row &row) {
  Json::Value task;
  task["id"] = value(row, "id");
  task["batch_id"] = value(row, "batch_id");
  task["vehicle_id"] = value(row, "vehicle_id");
  task["state"] = value(row, "state");
  task["attempt"] = row["attempt"].as<int>();
  task["max_attempts"] = row["max_attempts"].as<int>();
  task["progress"] = row["progress"].as<int>();
  task["error_code"] = row["error_code"].is_null()
                           ? Json::Value(Json::nullValue)
                           : Json::Value(value(row, "error_code"));
  task["error_message"] = row["error_message"].is_null()
                              ? Json::Value(Json::nullValue)
                              : Json::Value(value(row, "error_message"));
  task["offered_at"] = row["offered_at"].is_null()
                           ? Json::Value(Json::nullValue)
                           : Json::Value(value(row, "offered_at"));
  task["accepted_at"] = row["accepted_at"].is_null()
                            ? Json::Value(Json::nullValue)
                            : Json::Value(value(row, "accepted_at"));
  task["delivered_at"] = row["delivered_at"].is_null()
                             ? Json::Value(Json::nullValue)
                             : Json::Value(value(row, "delivered_at"));
  task["updated_at"] = value(row, "updated_at");
  return task;
}

bool projectAllowed(pqxx::work &tx, const std::string &projectId,
                    const std::string &userId, const std::string &role) {
  const auto rows = tx.exec_params(
      "SELECT user_id::text FROM projects WHERE id = $1::uuid", projectId);
  return !rows.empty() &&
         (role == "super_admin" || rows[0][0].as<std::string>() == userId);
}

long long nextEventSequence(pqxx::work &tx, const std::string &taskId) {
  return tx.exec_params(
               "SELECT COALESCE(MAX(sequence), 0) + 1 "
               "FROM deployment_events WHERE task_id = $1::uuid",
               taskId)[0][0]
      .as<long long>();
}

void appendEvent(pqxx::work &tx, const std::string &taskId,
                 const std::string &actor, const std::string &fromState,
                 const std::string &toState, int progress,
                 const std::string &code = {},
                 const std::string &message = {},
                 const std::string &deviceEventId = {}) {
  tx.exec_params(
      "INSERT INTO deployment_events "
      "(task_id, sequence, actor, device_event_id, from_state, to_state, "
      "progress, code, message) VALUES "
      "($1::uuid, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, ''), $6, $7, "
      "NULLIF($8, ''), NULLIF($9, ''))",
      taskId, nextEventSequence(tx, taskId), actor, deviceEventId, fromState,
      toState, progress, code, message);
}

std::string makeLease(const std::string &secret, const std::string &taskId,
                      const std::string &vehicleId, int attempt,
                      long long expiresAt) {
  Json::Value payload;
  payload["kind"] = "device_task_lease";
  payload["task_id"] = taskId;
  payload["vehicle_id"] = vehicleId;
  payload["attempt"] = attempt;
  payload["exp"] = static_cast<Json::Int64>(expiresAt);
  return roc::utils::createJwt(payload, secret);
}

const char *kTaskSelect =
    "SELECT t.id::text, t.batch_id::text, t.vehicle_id::text, t.state, "
    "t.attempt, t.max_attempts, t.lease_token_hash, "
    "EXTRACT(EPOCH FROM t.lease_expires_at)::bigint AS lease_exp_epoch, "
    "t.progress, t.error_code, t.error_message, "
    "t.offered_at::text, t.accepted_at::text, t.delivered_at::text, "
    "t.updated_at::text, b.project_id::text, b.resource_type, "
    "b.resource_revision_id::text, "
    "COALESCE(r.map_id, a.map_id)::text AS resource_map_id, "
    "COALESCE(r.content_type, a.content_type) AS content_type, "
    "COALESCE(r.byte_size, a.byte_size) AS byte_size, "
    "COALESCE(r.sha256, a.sha256) AS sha256, "
    "r.schema_version, r.version AS road_version, a.version AS map_version, "
    "r.network::text AS network_json, a.storage_key "
    "FROM deployment_tasks t "
    "JOIN deployment_batches b ON b.id = t.batch_id "
    "LEFT JOIN road_network_revisions r "
    "ON b.resource_type = 'road_network' AND r.id = b.resource_revision_id "
    "LEFT JOIN map_artifacts a "
    "ON b.resource_type = 'map' AND a.id = b.resource_revision_id ";

DeploymentResult batchResult(const std::string &connStr,
                             const std::string &projectId,
                             const std::string &batchId,
                             const std::string &userId,
                             const std::string &role) {
  pqxx::connection conn(connStr);
  pqxx::work tx(conn);
  if (!projectAllowed(tx, projectId, userId, role)) {
    return fail(404, "not_found", "Project is unavailable");
  }
  const auto batches = tx.exec_params(
      "SELECT id::text, project_id::text, resource_type, "
      "resource_revision_id::text, created_by::text, idempotency_key, "
      "cancel_requested_at::text, created_at::text "
      "FROM deployment_batches WHERE id = $1::uuid AND project_id = $2::uuid",
      batchId, projectId);
  if (batches.empty()) return fail(404, "not_found", "Deployment not found");

  Json::Value body;
  body["ok"] = true;
  Json::Value batch;
  const auto &row = batches[0];
  batch["id"] = value(row, "id");
  batch["project_id"] = value(row, "project_id");
  batch["resource_type"] = value(row, "resource_type");
  batch["resource_revision_id"] = value(row, "resource_revision_id");
  batch["created_by"] = value(row, "created_by");
  batch["idempotency_key"] = value(row, "idempotency_key");
  batch["cancel_requested_at"] =
      row["cancel_requested_at"].is_null()
          ? Json::Value(Json::nullValue)
          : Json::Value(value(row, "cancel_requested_at"));
  batch["created_at"] = value(row, "created_at");

  Json::Value tasks(Json::arrayValue);
  const auto taskRows = tx.exec_params(
      std::string(kTaskSelect) +
          "WHERE t.batch_id = $1::uuid ORDER BY t.updated_at, t.id",
      batchId);
  for (const auto &taskRow : taskRows) tasks.append(taskJson(taskRow));
  batch["tasks"] = tasks;
  body["deployment"] = batch;
  tx.commit();
  return {200, body};
}

DeploymentResult authorizedTask(pqxx::work &tx, const DeviceIdentity &device,
                                const std::string &taskId,
                                const std::string &leaseToken,
                                pqxx::result *rowsOut) {
  auto rows = tx.exec_params(std::string(kTaskSelect) +
                                 "WHERE t.id = $1::uuid AND "
                                 "t.vehicle_id = $2::uuid FOR UPDATE OF t",
                             taskId, device.vehicleId);
  if (rows.empty()) return fail(404, "not_found", "Task not found");
  const auto &row = rows[0];
  const auto state = value(row, "state");
  if (state != "accepted" && state != "downloading" &&
      state != "delivering") {
    return fail(409, "invalid_state", "Task does not hold an active lease");
  }
  if (row["lease_exp_epoch"].is_null() ||
      row["lease_exp_epoch"].as<long long>() <
          static_cast<long long>(std::time(nullptr))) {
    return fail(409, "lease_expired", "Task lease has expired");
  }
  if (leaseToken.empty() ||
      roc::utils::sha256Hex(leaseToken) != value(row, "lease_token_hash")) {
    return fail(401, "invalid_lease", "Task lease is invalid");
  }
  *rowsOut = std::move(rows);
  return {200, Json::Value(Json::objectValue)};
}

}  // namespace

DeploymentService::DeploymentService(std::string connStr,
                                     std::string jwtSecret)
    : connStr_(std::move(connStr)), jwtSecret_(std::move(jwtSecret)) {}

std::optional<DeviceIdentity> DeploymentService::authenticateDevice(
    const std::string &deviceToken) const {
  if (deviceToken.size() < 16 || deviceToken.size() > 256 ||
      deviceToken.find_first_of(" \t\r\n") != std::string::npos) {
    return std::nullopt;
  }
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  const auto rows = tx.exec_params(
      "SELECT id::text, project_id::text, map_id::text FROM vehicles "
      "WHERE device_enabled = true AND device_token_hash = $1",
      roc::utils::sha256Hex(deviceToken));
  if (rows.empty()) return std::nullopt;
  DeviceIdentity identity;
  identity.vehicleId = value(rows[0], "id");
  identity.projectId = value(rows[0], "project_id");
  identity.mapId = value(rows[0], "map_id");
  tx.commit();
  return identity;
}

DeploymentResult DeploymentService::createBatch(
    const std::string &projectId, const std::string &userId,
    const std::string &role, const std::string &resourceType,
    const std::string &resourceRevisionId,
    const std::vector<std::string> &vehicleIds,
    const std::string &idempotencyKey) const {
  if (resourceType != "road_network" && resourceType != "map") {
    return fail(400, "invalid_resource_type",
                "resource_type must be road_network or map");
  }
  if (vehicleIds.empty() || vehicleIds.size() > 500) {
    return fail(400, "invalid_vehicles",
                "vehicle_ids must contain between 1 and 500 vehicles");
  }
  if (idempotencyKey.empty() || idempotencyKey.size() > 128) {
    return fail(400, "invalid_idempotency_key",
                "idempotency_key must contain 1 to 128 characters");
  }

  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  if (!projectAllowed(tx, projectId, userId, role)) {
    return fail(404, "not_found", "Project is unavailable");
  }

  const auto existing = tx.exec_params(
      "SELECT id::text FROM deployment_batches "
      "WHERE project_id = $1::uuid AND created_by = $2::uuid "
      "AND idempotency_key = $3",
      projectId, userId, idempotencyKey);
  if (!existing.empty()) {
    const auto batchId = existing[0][0].as<std::string>();
    tx.commit();
    return batchResult(connStr_, projectId, batchId, userId, role);
  }

  const auto batchRows = tx.exec_params(
      "INSERT INTO deployment_batches "
      "(project_id, resource_type, resource_revision_id, created_by, "
      "idempotency_key) VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5) "
      "RETURNING id::text",
      projectId, resourceType, resourceRevisionId, userId, idempotencyKey);
  const auto batchId = batchRows[0][0].as<std::string>();

  std::set<std::string> uniqueVehicles(vehicleIds.begin(), vehicleIds.end());
  for (const auto &vehicleId : uniqueVehicles) {
    const auto tasks = tx.exec_params(
        "INSERT INTO deployment_tasks (batch_id, vehicle_id) "
        "VALUES ($1::uuid, $2::uuid) RETURNING id::text",
        batchId, vehicleId);
    appendEvent(tx, tasks[0][0].as<std::string>(), "platform", "", "queued", 0);
  }
  tx.commit();
  return batchResult(connStr_, projectId, batchId, userId, role);
}
DeploymentResult DeploymentService::getBatch(
    const std::string &projectId, const std::string &batchId,
    const std::string &userId, const std::string &role) const {
  return batchResult(connStr_, projectId, batchId, userId, role);
}

DeploymentResult DeploymentService::cancelBatch(
    const std::string &projectId, const std::string &batchId,
    const std::string &userId, const std::string &role) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  if (!projectAllowed(tx, projectId, userId, role)) {
    return fail(404, "not_found", "Project is unavailable");
  }
  const auto batches = tx.exec_params(
      "SELECT id FROM deployment_batches "
      "WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      batchId, projectId);
  if (batches.empty()) return fail(404, "not_found", "Deployment not found");

  tx.exec_params(
      "UPDATE deployment_batches SET cancel_requested_at = "
      "COALESCE(cancel_requested_at, NOW()) WHERE id = $1::uuid",
      batchId);
  const auto tasks = tx.exec_params(
      "SELECT id::text, state, progress FROM deployment_tasks "
      "WHERE batch_id = $1::uuid "
      "AND state IN ('queued', 'offered', 'accepted', 'downloading') "
      "FOR UPDATE",
      batchId);
  for (const auto &task : tasks) {
    const auto taskId = value(task, "id");
    const auto oldState = value(task, "state");
    const auto progress = task["progress"].as<int>();
    tx.exec_params(
        "UPDATE deployment_tasks SET state = 'canceled', "
        "lease_token_hash = NULL, lease_expires_at = NULL, "
        "updated_at = NOW() WHERE id = $1::uuid",
        taskId);
    appendEvent(tx, taskId, "platform", oldState, "canceled", progress,
                "cancel_requested", "Deployment canceled by account user");
  }
  tx.commit();
  return batchResult(connStr_, projectId, batchId, userId, role);
}

std::vector<Json::Value> DeploymentService::offerPendingTasks(
    const std::string &vehicleId) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);

  const auto expired = tx.exec_params(
      "SELECT id::text, state, attempt, max_attempts, progress "
      "FROM deployment_tasks WHERE vehicle_id = $1::uuid "
      "AND state IN ('accepted', 'downloading', 'delivering') "
      "AND lease_expires_at < NOW() FOR UPDATE",
      vehicleId);
  for (const auto &task : expired) {
    const auto taskId = value(task, "id");
    const auto oldState = value(task, "state");
    const auto attempt = task["attempt"].as<int>();
    const auto maxAttempts = task["max_attempts"].as<int>();
    const auto progress = task["progress"].as<int>();
    const bool canRetry = oldState != "delivering" && attempt < maxAttempts;
    const auto nextState = canRetry ? "offered" : "failed";
    tx.exec_params(
        "UPDATE deployment_tasks SET state = $2::varchar(24), lease_token_hash = NULL, "
        "lease_expires_at = NULL, error_code = $3, error_message = $4, "
        "offered_at = CASE WHEN $2::varchar(24) = 'offered' THEN NOW() ELSE offered_at END, "
        "updated_at = NOW() WHERE id = $1::uuid",
        taskId, nextState, canRetry ? "" : "lease_expired",
        canRetry ? "" : "Task lease expired before completion");
    appendEvent(tx, taskId, "platform", oldState, nextState, progress,
                canRetry ? "lease_requeued" : "lease_expired",
                canRetry ? "Expired lease was requeued"
                         : "Expired lease exhausted delivery");
  }

  const auto queued = tx.exec_params(
      "SELECT id::text, state, progress FROM deployment_tasks "
      "WHERE vehicle_id = $1::uuid AND state IN ('queued', 'offered') "
      "ORDER BY updated_at, id FOR UPDATE",
      vehicleId);
  for (const auto &task : queued) {
    if (value(task, "state") == "queued") {
      const auto taskId = value(task, "id");
      tx.exec_params(
          "UPDATE deployment_tasks SET state = 'offered', offered_at = NOW(), "
          "updated_at = NOW() WHERE id = $1::uuid",
          taskId);
      appendEvent(tx, taskId, "platform", "queued", "offered",
                  task["progress"].as<int>());
    }
  }

  const auto rows = tx.exec_params(
      std::string(kTaskSelect) +
          "WHERE t.vehicle_id = $1::uuid AND t.state = 'offered' "
          "ORDER BY t.offered_at, t.id",
      vehicleId);
  std::vector<Json::Value> offers;
  offers.reserve(rows.size());
  for (const auto &row : rows) {
    Json::Value offer;
    offer["task_id"] = value(row, "id");
    offer["batch_id"] = value(row, "batch_id");
    offer["project_id"] = value(row, "project_id");
    offer["resource_type"] = value(row, "resource_type");
    offer["resource_revision_id"] = value(row, "resource_revision_id");
    offer["attempt"] = row["attempt"].as<int>();
    offer["max_attempts"] = row["max_attempts"].as<int>();
    offers.push_back(std::move(offer));
  }
  tx.commit();
  return offers;
}

DeploymentResult DeploymentService::acceptTask(
    const DeviceIdentity &device, const std::string &taskId) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  auto rows = tx.exec_params(std::string(kTaskSelect) +
                                 "WHERE t.id = $1::uuid AND "
                                 "t.vehicle_id = $2::uuid FOR UPDATE OF t",
                             taskId, device.vehicleId);
  if (rows.empty()) return fail(404, "not_found", "Task not found");
  const auto &row = rows[0];
  const auto currentState = value(row, "state");
  const auto now = static_cast<long long>(std::time(nullptr));

  if (currentState == "accepted" && !row["lease_exp_epoch"].is_null() &&
      row["lease_exp_epoch"].as<long long>() >= now) {
    const auto expiresAt = row["lease_exp_epoch"].as<long long>();
    const auto token =
        makeLease(jwtSecret_, taskId, device.vehicleId,
                  row["attempt"].as<int>(), expiresAt);
    if (roc::utils::sha256Hex(token) != value(row, "lease_token_hash")) {
      return fail(409, "lease_conflict", "Stored lease cannot be reissued");
    }
    Json::Value body;
    body["ok"] = true;
    body["replayed"] = true;
    body["lease_token"] = token;
    body["lease_expires_at"] = static_cast<Json::Int64>(expiresAt);
    body["task"] = taskJson(row);
    tx.commit();
    return {200, body};
  }

  if (currentState != "offered" && currentState != "queued" &&
      currentState != "accepted") {
    return fail(409, "invalid_state", "Task cannot be accepted in its state");
  }

  const auto attempt = row["attempt"].as<int>() + 1;
  if (attempt > row["max_attempts"].as<int>()) {
    tx.exec_params(
        "UPDATE deployment_tasks SET state = 'failed', "
        "error_code = 'attempts_exhausted', "
        "error_message = 'Task exceeded its delivery attempt limit', "
        "lease_token_hash = NULL, lease_expires_at = NULL, updated_at = NOW() "
        "WHERE id = $1::uuid",
        taskId);
    appendEvent(tx, taskId, "platform", currentState, "failed",
                row["progress"].as<int>(), "attempts_exhausted",
                "Task exceeded its delivery attempt limit");
    tx.commit();
    return fail(409, "attempts_exhausted",
                "Task exceeded its delivery attempt limit");
  }

  const auto expiresAt = now + kLeaseSeconds;
  const auto token =
      makeLease(jwtSecret_, taskId, device.vehicleId, attempt, expiresAt);
  tx.exec_params(
      "UPDATE deployment_tasks SET state = 'accepted', attempt = $2, "
      "lease_token_hash = $3, "
      "lease_expires_at = TO_TIMESTAMP($4), accepted_at = NOW(), "
      "error_code = NULL, error_message = NULL, updated_at = NOW() "
      "WHERE id = $1::uuid",
      taskId, attempt, roc::utils::sha256Hex(token), expiresAt);
  appendEvent(tx, taskId, "device", currentState, "accepted",
              row["progress"].as<int>());
  tx.commit();

  pqxx::connection readConn(connStr_);
  pqxx::work readTx(readConn);
  const auto accepted = readTx.exec_params(
      std::string(kTaskSelect) + "WHERE t.id = $1::uuid", taskId);
  Json::Value body;
  body["ok"] = true;
  body["replayed"] = false;
  body["lease_token"] = token;
  body["lease_expires_at"] = static_cast<Json::Int64>(expiresAt);
  body["task"] = taskJson(accepted[0]);
  readTx.commit();
  return {200, body};
}
DeploymentResult DeploymentService::getManifest(
    const DeviceIdentity &device, const std::string &taskId,
    const std::string &leaseToken) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  pqxx::result rows;
  const auto auth = authorizedTask(tx, device, taskId, leaseToken, &rows);
  if (!auth.ok()) return auth;
  const auto &row = rows[0];

  Json::Value manifest;
  manifest["task_id"] = taskId;
  manifest["batch_id"] = value(row, "batch_id");
  manifest["project_id"] = value(row, "project_id");
  manifest["resource_type"] = value(row, "resource_type");
  manifest["resource_revision_id"] = value(row, "resource_revision_id");
  manifest["map_id"] = value(row, "resource_map_id");
  manifest["content_type"] = value(row, "content_type");
  manifest["byte_size"] = static_cast<Json::Int64>(
      row["byte_size"].as<long long>());
  manifest["sha256"] = value(row, "sha256");
  manifest["version"] = row["resource_type"].as<std::string>() == "road_network"
                            ? row["road_version"].as<int>()
                            : row["map_version"].as<int>();
  if (!row["schema_version"].is_null()) {
    manifest["schema_version"] = row["schema_version"].as<int>();
  }
  manifest["artifact_url"] = "/api/device/tasks/" + taskId + "/artifact";

  Json::Value body;
  body["ok"] = true;
  body["manifest"] = manifest;
  tx.commit();
  return {200, body};
}

DeploymentResult DeploymentService::getArtifact(
    const DeviceIdentity &device, const std::string &taskId,
    const std::string &leaseToken) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  pqxx::result rows;
  const auto auth = authorizedTask(tx, device, taskId, leaseToken, &rows);
  if (!auth.ok()) return auth;
  const auto &row = rows[0];

  Json::Value body;
  body["ok"] = true;
  body["resource_type"] = value(row, "resource_type");
  body["content_type"] = value(row, "content_type");
  body["byte_size"] =
      static_cast<Json::Int64>(row["byte_size"].as<long long>());
  body["sha256"] = value(row, "sha256");
  if (value(row, "resource_type") == "road_network") {
    body["network"] = parseJson(value(row, "network_json"));
  } else {
    body["storage_key"] = value(row, "storage_key");
  }
  tx.commit();
  return {200, body};
}

DeploymentResult DeploymentService::updateTaskStatus(
    const DeviceIdentity &device, const std::string &taskId,
    const std::string &leaseToken, const std::string &eventId,
    const std::string &state, int progress, const std::string &errorCode,
    const std::string &errorMessage) const {
  pqxx::connection conn(connStr_);
  pqxx::work tx(conn);
  auto rows = tx.exec_params(std::string(kTaskSelect) +
                                 "WHERE t.id = $1::uuid AND "
                                 "t.vehicle_id = $2::uuid FOR UPDATE OF t",
                             taskId, device.vehicleId);
  if (rows.empty()) return fail(404, "not_found", "Task not found");

  const auto duplicate = tx.exec_params(
      "SELECT task_id::text FROM deployment_events "
      "WHERE device_event_id = $1::uuid",
      eventId);
  if (!duplicate.empty()) {
    if (duplicate[0][0].as<std::string>() != taskId) {
      return fail(409, "event_conflict",
                  "event_id already belongs to another task");
    }
    Json::Value body;
    body["ok"] = true;
    body["replayed"] = true;
    body["project_id"] = value(rows[0], "project_id");
    body["task"] = taskJson(rows[0]);
    tx.commit();
    return {200, body};
  }

  const auto &row = rows[0];
  const auto currentState = value(row, "state");
  const auto now = static_cast<long long>(std::time(nullptr));
  if (currentState != "accepted" && currentState != "downloading" &&
      currentState != "delivering") {
    return fail(409, "invalid_state", "Task does not hold an active lease");
  }
  if (row["lease_exp_epoch"].is_null() ||
      row["lease_exp_epoch"].as<long long>() < now) {
    return fail(409, "lease_expired", "Task lease has expired");
  }
  if (leaseToken.empty() ||
      roc::utils::sha256Hex(leaseToken) != value(row, "lease_token_hash")) {
    return fail(401, "invalid_lease", "Task lease is invalid");
  }

  bool transitionAllowed = false;
  if (currentState == "accepted") {
    transitionAllowed = state == "downloading" || state == "failed";
  } else if (currentState == "downloading") {
    transitionAllowed =
        state == "downloading" || state == "delivering" || state == "failed";
  } else if (currentState == "delivering") {
    transitionAllowed =
        state == "delivering" || state == "delivered" || state == "failed";
  }
  if (!transitionAllowed) {
    return fail(409, "invalid_transition",
                "Requested task state transition is not allowed");
  }
  if (progress < row["progress"].as<int>() || progress > 100) {
    return fail(400, "invalid_progress",
                "progress must be monotonic and between 0 and 100");
  }
  if (state == "delivered" && progress != 100) {
    return fail(400, "invalid_progress",
                "delivered tasks must report progress 100");
  }
  if (state == "failed" && errorCode.empty()) {
    return fail(400, "error_code_required",
                "failed tasks must provide error_code");
  }

  const bool terminal = state == "delivered" || state == "failed";
  tx.exec_params(
      "UPDATE deployment_tasks SET state = $2::varchar(24), progress = $3, "
      "error_code = NULLIF($4, ''), error_message = NULLIF($5, ''), "
      "delivered_at = CASE WHEN $2::varchar(24) = 'delivered' THEN NOW() "
      "ELSE delivered_at END, "
      "lease_token_hash = CASE WHEN $6 THEN NULL ELSE lease_token_hash END, "
      "lease_expires_at = CASE WHEN $6 THEN NULL ELSE lease_expires_at END, "
      "updated_at = NOW() WHERE id = $1::uuid",
      taskId, state, progress, errorCode, errorMessage, terminal);
  appendEvent(tx, taskId, "device", currentState, state, progress, errorCode,
              errorMessage, eventId);

  if (state == "delivered") {
    if (value(row, "resource_type") == "road_network") {
      tx.exec_params(
          "UPDATE vehicles SET delivered_road_revision_id = $2::uuid "
          "WHERE id = $1::uuid",
          device.vehicleId, value(row, "resource_revision_id"));
    } else {
      tx.exec_params(
          "UPDATE vehicles SET delivered_map_artifact_id = $2::uuid "
          "WHERE id = $1::uuid",
          device.vehicleId, value(row, "resource_revision_id"));
    }
  }
  tx.commit();

  pqxx::connection readConn(connStr_);
  pqxx::work readTx(readConn);
  const auto updated = readTx.exec_params(
      std::string(kTaskSelect) + "WHERE t.id = $1::uuid", taskId);
  Json::Value body;
  body["ok"] = true;
  body["replayed"] = false;
  body["project_id"] = value(updated[0], "project_id");
  body["task"] = taskJson(updated[0]);
  readTx.commit();
  return {200, body};
}

}  // namespace roc::service