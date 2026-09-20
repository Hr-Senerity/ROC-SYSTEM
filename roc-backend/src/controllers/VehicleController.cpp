#include "controllers/VehicleController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <sstream>
#include <vector>

#include "db/PostgresClient.h"
#include "controllers/DeviceWsController.h"
#include "controllers/StatusWsController.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::controller {

using namespace drogon;

namespace {

Json::Value makeResp(bool ok, const std::string &msg = "") {
  Json::Value value;
  value["ok"] = ok;
  if (!msg.empty()) value["message"] = msg;
  return value;
}

HttpResponsePtr jsonResp(HttpStatusCode code, const Json::Value &value) {
  auto response = HttpResponse::newHttpJsonResponse(value);
  response->setStatusCode(code);
  return response;
}

bool respondForInvalidId(
    const std::string &value,
    const std::function<void(const HttpResponsePtr &)> &cb,
    const std::string &field) {
  if (roc::utils::isUuid(value)) return false;
  cb(jsonResp(k400BadRequest, makeResp(false, field + " must be a UUID")));
  return true;
}

std::optional<Json::Value> authReq(const HttpRequestPtr &req,
                                   const std::string &secret) {
  const auto header = req->getHeader("Authorization");
  if (header.empty() || header.find("Bearer ") != 0) return std::nullopt;
  return roc::utils::verifyJwt(header.substr(7), secret);
}

constexpr const char *kVehicleColumns =
    "id, user_id, project_id, map_id, name, ip, status, cpu, memory, battery, "
    "localization_confidence, position_x, position_y, position_theta, "
    "velocity_linear, velocity_angular, delivery_path, last_heartbeat, "
    "telemetry_version::text AS version, received_at, created_at, "
    "device_enabled, device_token_hint, delivered_road_revision_id, "
    "delivered_map_artifact_id";

enum class Access { Allowed, NotFound, Forbidden };

Access checkProjectAccess(roc::db::PostgresClient &pg,
                          const std::string &projectId,
                          const std::string &userId,
                          const std::string &role,
                          std::string *ownerId = nullptr) {
  const auto project = pg.queryOneParams(
      "SELECT user_id FROM projects WHERE id = $1::uuid", {projectId});
  if (project.isNull()) return Access::NotFound;
  const auto owner = project["user_id"].asString();
  if (ownerId) *ownerId = owner;
  if (role != "super_admin" && owner != userId) return Access::Forbidden;
  return Access::Allowed;
}

Access checkVehicleAccess(roc::db::PostgresClient &pg,
                          const std::string &vehicleId,
                          const std::string &userId,
                          const std::string &role,
                          Json::Value *vehicle = nullptr) {
  const auto result = pg.queryOneParams(
      "SELECT id, user_id, project_id, map_id FROM vehicles WHERE id = $1::uuid",
      {vehicleId});
  if (result.isNull()) return Access::NotFound;
  if (vehicle) *vehicle = result;
  if (role != "super_admin" && result["user_id"].asString() != userId) {
    return Access::Forbidden;
  }
  return Access::Allowed;
}

bool respondForAccess(Access access,
                      const std::function<void(const HttpResponsePtr &)> &cb,
                      const std::string &resource) {
  if (access == Access::NotFound) {
    cb(jsonResp(k404NotFound, makeResp(false, resource + " not found")));
    return true;
  }
  if (access == Access::Forbidden) {
    cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden")));
    return true;
  }
  return false;
}

std::string numberText(const Json::Value &value) {
  std::ostringstream output;
  output.precision(17);
  output << value.asDouble();
  return output.str();
}

}  // namespace

void registerVehicleRoutes(const roc::config::AppConfig &cfg,
                           const std::string &connStr) {
  const auto jwtSecret = cfg.auth.jwtSecret;

  app().registerHandler(
      "/api/vehicles",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }

        const auto userId = (*principal)["user_id"].asString();
        const auto role = (*principal)["role"].asString();
        const auto projectId = req->getParameter("project_id");
        if (!projectId.empty() && respondForInvalidId(projectId, cb, "project_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          Json::Value vehicles;
          if (!projectId.empty()) {
            const auto access = checkProjectAccess(pg, projectId, userId, role);
            if (respondForAccess(access, cb, "Project")) return;
            vehicles = pg.queryParams(
                std::string("SELECT ") + kVehicleColumns +
                    " FROM vehicles WHERE project_id = $1::uuid ORDER BY created_at DESC",
                {projectId});
          } else if (role == "super_admin") {
            vehicles = pg.query(
                std::string("SELECT ") + kVehicleColumns +
                " FROM vehicles ORDER BY created_at DESC");
          } else {
            vehicles = pg.queryParams(
                std::string("SELECT ") + kVehicleColumns +
                    " FROM vehicles WHERE user_id = $1::uuid ORDER BY created_at DESC",
                {userId});
          }

          Json::Value response;
          response["ok"] = true;
          response["vehicles"] = vehicles;
          cb(jsonResp(k200OK, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "List vehicles: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  app().registerHandler(
      "/api/vehicles",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        const auto body = req->getJsonObject();
        if (!body) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON")));
          return;
        }

        const auto name = (*body).get("name", "").asString();
        const auto ip = (*body).get("ip", "").asString();
        const auto projectId = (*body).get("project_id", "").asString();
        const auto mapId = (*body).get("map_id", "").asString();
        if (name.empty() || ip.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "name and ip required")));
          return;
        }
        if (!mapId.empty() && projectId.empty()) {
          cb(jsonResp(k409Conflict, makeResp(false, "A map requires a project")));
          return;
        }
        if ((!projectId.empty() && respondForInvalidId(projectId, cb, "project_id")) ||
            (!mapId.empty() && respondForInvalidId(mapId, cb, "map_id"))) return;

        const auto principalUserId = (*principal)["user_id"].asString();
        const auto role = (*principal)["role"].asString();
        try {
          roc::db::PostgresClient pg(connStr);
          std::string ownerId = principalUserId;
          if (!projectId.empty()) {
            const auto access = checkProjectAccess(
                pg, projectId, principalUserId, role, &ownerId);
            if (respondForAccess(access, cb, "Project")) return;
          }
          if (!mapId.empty()) {
            const auto map = pg.queryOneParams(
                "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
                {mapId, projectId});
            if (map.isNull()) {
              cb(jsonResp(k409Conflict, makeResp(false, "Map does not belong to project")));
              return;
            }
          }

          const auto id = pg.insertReturningParams(
              "INSERT INTO vehicles (user_id, name, ip, project_id, map_id) "
              "VALUES ($1::uuid, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid) "
              "RETURNING id",
              {ownerId, name, ip, projectId, mapId});
          const auto vehicle = pg.queryOneParams(
              std::string("SELECT ") + kVehicleColumns +
                  " FROM vehicles WHERE id = $1::uuid",
              {id});

          Json::Value response;
          response["ok"] = true;
          response["vehicle"] = vehicle;
          roc::ws::StatusWsController::broadcastVehicle("vehicle_created", vehicle);
          cb(jsonResp(k201Created, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Create vehicle: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Post, Options});

  app().registerHandler(
      "/api/vehicles/{id}/device-token",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &vehicleId) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(vehicleId, cb, "vehicle_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkVehicleAccess(
              pg, vehicleId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString());
          if (respondForAccess(access, cb, "Vehicle")) return;

          const auto token = std::string("roc_dev_") + roc::utils::generateSalt(24);
          const auto tokenHash = roc::utils::sha256Hex(token);
          const auto hint = token.substr(token.size() - 8);
          const auto vehicle = pg.queryOneParams(
              std::string("UPDATE vehicles SET device_token_hash = $1, ") +
                  "device_token_hint = $2, device_enabled = true, status = 'offline', "
                  "device_protocol_version = NULL, device_library_version = NULL, "
                  "device_last_sequence = 0, device_connected_at = NULL, "
                  "device_disconnected_at = NOW(), received_at = NOW(), "
                  "telemetry_version = telemetry_version + 1 "
                  "WHERE id = $3::uuid RETURNING " + kVehicleColumns,
              {tokenHash, hint, vehicleId});
          roc::ws::StatusWsController::broadcastVehicle("vehicle_updated", vehicle);
          roc::ws::DeviceWsController::disconnectVehicle(
              vehicleId, "credential_rotated", tokenHash);

          Json::Value response;
          response["ok"] = true;
          response["device_token"] = token;
          response["token_hint"] = hint;
          response["enabled"] = true;
          response["message"] = "Store this token now; it will not be shown again";
          cb(jsonResp(k200OK, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Issue device token: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Post, Options});

  app().registerHandler(
      "/api/vehicles/{id}/device-token",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &vehicleId) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(vehicleId, cb, "vehicle_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkVehicleAccess(
              pg, vehicleId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString());
          if (respondForAccess(access, cb, "Vehicle")) return;
          const auto credential = pg.queryOneParams(
              "SELECT device_enabled, device_token_hint FROM vehicles WHERE id = $1::uuid",
              {vehicleId});
          Json::Value response;
          response["ok"] = true;
          response["configured"] = !credential["device_token_hint"].isNull();
          response["enabled"] = credential["device_enabled"].asBool();
          response["token_hint"] = credential["device_token_hint"];
          cb(jsonResp(k200OK, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Read device token status: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  app().registerHandler(
      "/api/vehicles/{id}/device-token",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &vehicleId) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(vehicleId, cb, "vehicle_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkVehicleAccess(
              pg, vehicleId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString());
          if (respondForAccess(access, cb, "Vehicle")) return;
          const auto vehicle = pg.queryOneParams(
              std::string("UPDATE vehicles SET device_token_hash = NULL, ") +
                  "device_token_hint = NULL, device_enabled = false, "
                  "status = 'offline', device_protocol_version = NULL, "
                  "device_library_version = NULL, device_last_sequence = 0, "
                  "device_connected_at = NULL, device_disconnected_at = NOW(), "
                  "received_at = NOW(), telemetry_version = telemetry_version + 1 "
                  "WHERE id = $1::uuid RETURNING " + kVehicleColumns,
              {vehicleId});
          roc::ws::StatusWsController::broadcastVehicle("vehicle_updated", vehicle);
          roc::ws::DeviceWsController::disconnectVehicle(
              vehicleId, "credential_revoked");
          cb(jsonResp(k200OK, makeResp(true, "Device token revoked")));
        } catch (const std::exception &error) {
          LOG_ERROR << "Revoke device token: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  app().registerHandler(
      "/api/vehicles/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &vehicleId) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(vehicleId, cb, "vehicle_id")) return;
        const auto body = req->getJsonObject();
        if (!body) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON")));
          return;
        }

        try {
          roc::db::PostgresClient pg(connStr);
          Json::Value existing;
          const auto access = checkVehicleAccess(
              pg, vehicleId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString(), &existing);
          if (respondForAccess(access, cb, "Vehicle")) return;

          std::vector<std::string> assignments;
          std::vector<std::string> params;
          auto addParam = [&](const std::string &column, const std::string &cast,
                              const std::string &value) {
            params.push_back(value);
            assignments.push_back(column + " = $" + std::to_string(params.size()) + cast);
          };
          if (body->isMember("name")) addParam("name", "", (*body)["name"].asString());
          if (body->isMember("ip")) addParam("ip", "", (*body)["ip"].asString());
          if (body->isMember("status")) addParam("status", "", (*body)["status"].asString());
          for (const auto *field : {"cpu", "memory", "battery", "localization_confidence",
                                    "position_x", "position_y", "position_theta",
                                    "velocity_linear", "velocity_angular"}) {
            if (body->isMember(field)) {
              addParam(field, "::double precision", numberText((*body)[field]));
            }
          }
          if (body->isMember("delivery_path")) {
            addParam("delivery_path", "::jsonb", (*body)["delivery_path"].toStyledString());
          }
          if (body->isMember("map_id")) {
            if ((*body)["map_id"].isNull() || (*body)["map_id"].asString().empty()) {
              assignments.push_back("map_id = NULL");
            } else {
              const auto projectId = existing["project_id"].asString();
              if (projectId.empty()) {
                cb(jsonResp(k409Conflict, makeResp(false, "Assign the vehicle to a project first")));
                return;
              }
              const auto mapId = (*body)["map_id"].asString();
              if (respondForInvalidId(mapId, cb, "map_id")) return;
              const auto map = pg.queryOneParams(
                  "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
                  {mapId, projectId});
              if (map.isNull()) {
                cb(jsonResp(k409Conflict, makeResp(false, "Map does not belong to project")));
                return;
              }
              addParam("map_id", "::uuid", mapId);
            }
          }
          if (assignments.empty()) {
            cb(jsonResp(k400BadRequest, makeResp(false, "No supported fields")));
            return;
          }

          std::ostringstream sql;
          sql << "UPDATE vehicles SET ";
          for (size_t index = 0; index < assignments.size(); ++index) {
            if (index > 0) sql << ", ";
            sql << assignments[index];
          }
          const bool telemetryUpdate = body->isMember("status") || body->isMember("cpu") ||
              body->isMember("memory") || body->isMember("battery") ||
              body->isMember("localization_confidence") || body->isMember("position_x") ||
              body->isMember("position_y") || body->isMember("position_theta") ||
              body->isMember("velocity_linear") || body->isMember("velocity_angular") ||
              body->isMember("delivery_path");
          if (telemetryUpdate) {
            sql << ", last_heartbeat = NOW(), received_at = NOW()";
          }
          sql << ", telemetry_version = telemetry_version + 1";
          params.push_back(vehicleId);
          sql << " WHERE id = $" << params.size() << "::uuid";
          pg.executeParams(sql.str(), params);

          const auto vehicle = pg.queryOneParams(
              std::string("SELECT ") + kVehicleColumns +
                  " FROM vehicles WHERE id = $1::uuid",
              {vehicleId});
          Json::Value response;
          response["ok"] = true;
          response["vehicle"] = vehicle;
          roc::ws::StatusWsController::broadcastVehicle("vehicle_updated", vehicle);
          cb(jsonResp(k200OK, response));
        } catch (const std::exception &error) {
          LOG_ERROR << "Update vehicle: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Patch, Options});

  app().registerHandler(
      "/api/vehicles/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &vehicleId) {
        const auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(vehicleId, cb, "vehicle_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          Json::Value existing;
          const auto access = checkVehicleAccess(
              pg, vehicleId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString(), &existing);
          if (respondForAccess(access, cb, "Vehicle")) return;
          pg.executeParams("DELETE FROM vehicles WHERE id = $1::uuid", {vehicleId});
          roc::ws::StatusWsController::broadcastVehicleDeleted(
              existing["project_id"].asString(), vehicleId);
          cb(jsonResp(k200OK, makeResp(true, "Deleted")));
        } catch (const std::exception &error) {
          LOG_ERROR << "Delete vehicle: " << error.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  LOG_INFO << "Vehicle routes registered";
}

}  // namespace roc::controller
