#include "controllers/RoadNetworkController.h"

#include <functional>
#include <optional>
#include <sstream>
#include <string>

#include <drogon/drogon.h>
#include <json/json.h>
#include <pqxx/pqxx>

#include "db/PostgresClient.h"
#include "services/RoadNetworkService.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::controller {
namespace {

using namespace drogon;

HttpResponsePtr jsonResponse(HttpStatusCode status, const Json::Value &body) {
  auto response = HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(status);
  response->addHeader("Cache-Control", "no-store");
  return response;
}

Json::Value errorBody(const std::string &code, const std::string &message) {
  Json::Value body;
  body["ok"] = false;
  body["code"] = code;
  body["message"] = message;
  return body;
}

std::optional<Json::Value> principal(const HttpRequestPtr &request,
                                     const std::string &secret) {
  const auto header = request->getHeader("Authorization");
  if (header.rfind("Bearer ", 0) != 0) return std::nullopt;
  return roc::utils::verifyJwt(header.substr(7), secret);
}

bool requireUuid(const std::string &value, const std::string &field,
                 const std::function<void(const HttpResponsePtr &)> &callback) {
  if (roc::utils::isUuid(value)) return true;
  callback(jsonResponse(k400BadRequest,
                        errorBody("invalid_id", field + " must be a UUID")));
  return false;
}

enum class Access { Allowed, NotFound, Forbidden };

Access projectAccess(roc::db::PostgresClient &postgres,
                     const std::string &projectId,
                     const Json::Value &account) {
  const auto project = postgres.queryOneParams(
      "SELECT user_id::text FROM projects WHERE id = $1::uuid", {projectId});
  if (project.isNull()) return Access::NotFound;
  if (account["role"].asString() != "super_admin" &&
      project["user_id"].asString() != account["user_id"].asString()) {
    return Access::Forbidden;
  }
  return Access::Allowed;
}

bool respondForAccess(Access access,
                      const std::function<void(const HttpResponsePtr &)> &callback) {
  if (access == Access::NotFound) {
    callback(jsonResponse(k404NotFound,
                          errorBody("project_not_found", "Project not found")));
    return true;
  }
  if (access == Access::Forbidden) {
    callback(jsonResponse(k403Forbidden, errorBody("forbidden", "Forbidden")));
    return true;
  }
  return false;
}

Json::Value revisionById(roc::db::PostgresClient &postgres,
                         const std::string &revisionId) {
  return postgres.queryOneParams(
      "SELECT r.id::text, r.map_id::text, r.version, r.schema_version, "
      "r.network, r.content_type, r.byte_size, r.sha256, "
      "r.created_by::text, u.username AS created_by_username, r.created_at "
      "FROM road_network_revisions r "
      "LEFT JOIN users u ON u.id = r.created_by "
      "WHERE r.id = $1::uuid",
      {revisionId});
}

Json::Value revisionMetadata(const Json::Value &revision) {
  Json::Value metadata = revision;
  metadata.removeMember("network");
  return metadata;
}

}  // namespace

void registerRoadNetworkRoutes(const roc::config::AppConfig &config,
                               const std::string &connStr) {
  const auto jwtSecret = config.auth.jwtSecret;

  app().registerHandler(
      "/api/projects/{projectId}/maps/{mapId}/road-network/revisions",
      [connStr, jwtSecret](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId,
                           const std::string &mapId) {
        const auto account = principal(request, jwtSecret);
        if (!account) {
          callback(jsonResponse(k401Unauthorized,
                                errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!requireUuid(projectId, "project_id", callback) ||
            !requireUuid(mapId, "map_id", callback)) return;

        try {
          roc::db::PostgresClient postgres(connStr);
          if (respondForAccess(projectAccess(postgres, projectId, *account), callback)) {
            return;
          }
          const auto map = postgres.queryOneParams(
              "SELECT id::text FROM maps WHERE id = $1::uuid "
              "AND project_id = $2::uuid",
              {mapId, projectId});
          if (map.isNull()) {
            callback(jsonResponse(k404NotFound,
                                  errorBody("map_not_found", "Map not found")));
            return;
          }

          const auto revisions = postgres.queryParams(
              "SELECT r.id::text, r.map_id::text, r.version, r.schema_version, "
              "r.content_type, r.byte_size, r.sha256, r.created_by::text, "
              "u.username AS created_by_username, r.created_at "
              "FROM road_network_revisions r "
              "LEFT JOIN users u ON u.id = r.created_by "
              "WHERE r.map_id = $1::uuid ORDER BY r.version DESC",
              {mapId});
          Json::Value body;
          body["ok"] = true;
          body["revisions"] = revisions;
          body["current_revision"] = revisions.empty()
              ? Json::Value(Json::nullValue)
              : revisions[0];
          callback(jsonResponse(k200OK, body));
        } catch (const std::exception &error) {
          LOG_ERROR << "List road network revisions: " << error.what();
          callback(jsonResponse(k500InternalServerError,
                                errorBody("internal_error",
                                          "Unable to list road network revisions")));
        }
      },
      {Get, Options});

  app().registerHandler(
      "/api/projects/{projectId}/maps/{mapId}/road-network/revisions/{revisionId}",
      [connStr, jwtSecret](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId,
                           const std::string &mapId,
                           const std::string &revisionId) {
        const auto account = principal(request, jwtSecret);
        if (!account) {
          callback(jsonResponse(k401Unauthorized,
                                errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!requireUuid(projectId, "project_id", callback) ||
            !requireUuid(mapId, "map_id", callback) ||
            !requireUuid(revisionId, "revision_id", callback)) return;

        try {
          roc::db::PostgresClient postgres(connStr);
          if (respondForAccess(projectAccess(postgres, projectId, *account), callback)) {
            return;
          }
          const auto revision = revisionById(postgres, revisionId);
          if (revision.isNull() || revision["map_id"].asString() != mapId) {
            callback(jsonResponse(
                k404NotFound,
                errorBody("revision_not_found", "Road network revision not found")));
            return;
          }
          const auto map = postgres.queryOneParams(
              "SELECT id::text FROM maps WHERE id = $1::uuid "
              "AND project_id = $2::uuid",
              {mapId, projectId});
          if (map.isNull()) {
            callback(jsonResponse(k404NotFound,
                                  errorBody("map_not_found", "Map not found")));
            return;
          }
          Json::Value body;
          body["ok"] = true;
          body["revision"] = revision;
          callback(jsonResponse(k200OK, body));
        } catch (const std::exception &error) {
          LOG_ERROR << "Get road network revision: " << error.what();
          callback(jsonResponse(k500InternalServerError,
                                errorBody("internal_error",
                                          "Unable to read road network revision")));
        }
      },
      {Get, Options});

  app().registerHandler(
      "/api/projects/{projectId}/maps/{mapId}/road-network/revisions",
      [connStr, jwtSecret](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId,
                           const std::string &mapId) {
        const auto account = principal(request, jwtSecret);
        if (!account) {
          callback(jsonResponse(k401Unauthorized,
                                errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!requireUuid(projectId, "project_id", callback) ||
            !requireUuid(mapId, "map_id", callback)) return;
        const auto body = request->getJsonObject();
        if (!body || !body->isObject() || !body->isMember("network") ||
            body->getMemberNames().size() != 1) {
          callback(jsonResponse(
              k400BadRequest,
              errorBody("invalid_json", "A JSON object containing only network is required")));
          return;
        }

        try {
          roc::db::PostgresClient postgres(connStr);
          if (respondForAccess(projectAccess(postgres, projectId, *account), callback)) {
            return;
          }
          const auto map = postgres.queryOneParams(
              "SELECT id::text, coordinate_mode FROM maps "
              "WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projectId});
          if (map.isNull()) {
            callback(jsonResponse(k404NotFound,
                                  errorBody("map_not_found", "Map not found")));
            return;
          }
          const auto validation = roc::service::validateRoadNetwork(
              (*body)["network"], map["coordinate_mode"].asString());
          if (!validation.ok) {
            callback(jsonResponse(k422UnprocessableEntity,
                                  errorBody(validation.code, validation.message)));
            return;
          }

          const auto digest = roc::utils::sha256Hex(validation.canonicalJson);
          pqxx::connection connection(connStr);
          pqxx::work transaction(connection);
          const auto lockedMap = transaction.exec_params(
              "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid "
              "FOR UPDATE",
              mapId, projectId);
          if (lockedMap.empty()) {
            transaction.abort();
            callback(jsonResponse(k404NotFound,
                                  errorBody("map_not_found", "Map not found")));
            return;
          }
          const auto versionRows = transaction.exec_params(
              "SELECT COALESCE(MAX(version), 0) + 1 AS next_version "
              "FROM road_network_revisions WHERE map_id = $1::uuid",
              mapId);
          const auto version = versionRows[0]["next_version"].as<int>();
          const auto inserted = transaction.exec_params(
              "INSERT INTO road_network_revisions "
              "(map_id, version, schema_version, network, byte_size, sha256, created_by) "
              "VALUES ($1::uuid, $2, 1, $3::jsonb, $4, $5, $6::uuid) RETURNING id::text",
              mapId, version, validation.canonicalJson,
              static_cast<long long>(validation.canonicalJson.size()), digest,
              (*account)["user_id"].asString());
          const auto revisionId = inserted[0][0].as<std::string>();
          // Keep the legacy map snapshot synchronized while readers migrate to revisions.
          transaction.exec_params(
              "UPDATE maps SET road_network = $2::jsonb WHERE id = $1::uuid",
              mapId, validation.canonicalJson);
          transaction.commit();

          const auto revision = revisionById(postgres, revisionId);
          Json::Value response;
          response["ok"] = true;
          response["revision"] = revision;
          callback(jsonResponse(k201Created, response));
        } catch (const pqxx::sql_error &error) {
          LOG_ERROR << "Save road network revision SQL error: " << error.what();
          callback(jsonResponse(k409Conflict,
                                errorBody("revision_conflict",
                                          "Unable to allocate a revision version")));
        } catch (const std::exception &error) {
          LOG_ERROR << "Save road network revision: " << error.what();
          callback(jsonResponse(k500InternalServerError,
                                errorBody("internal_error",
                                          "Unable to save road network revision")));
        }
      },
      {Post, Options});
}

}  // namespace roc::controller
