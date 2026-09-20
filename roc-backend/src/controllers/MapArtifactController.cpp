#include "controllers/MapArtifactController.h"

#include <filesystem>
#include <fstream>
#include <optional>
#include <random>
#include <sstream>

#include <drogon/drogon.h>
#include <pqxx/pqxx>

#include "db/PostgresClient.h"
#include "utils/ImageMetadata.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::controller {
namespace {

using namespace drogon;

HttpResponsePtr response(HttpStatusCode status, const Json::Value &body) {
  auto value = HttpResponse::newHttpJsonResponse(body);
  value->setStatusCode(status);
  value->addHeader("Cache-Control", "no-store");
  return value;
}

Json::Value error(const std::string &message) {
  Json::Value body;
  body["ok"] = false;
  body["message"] = message;
  return body;
}

std::optional<Json::Value> principal(const HttpRequestPtr &request,
                                     const std::string &secret) {
  const auto header = request->getHeader("Authorization");
  if (header.rfind("Bearer ", 0) != 0) return std::nullopt;
  return roc::utils::verifyJwt(header.substr(7), secret);
}

bool validId(const std::string &value,
             const std::function<void(const HttpResponsePtr &)> &callback,
             const std::string &field) {
  if (roc::utils::isUuid(value)) return true;
  callback(response(k400BadRequest, error(field + " must be a UUID")));
  return false;
}

bool allowed(roc::db::PostgresClient &pg, const std::string &projectId,
             const Json::Value &account,
             const std::function<void(const HttpResponsePtr &)> &callback) {
  const auto project = pg.queryOneParams(
      "SELECT user_id FROM projects WHERE id = $1::uuid", {projectId});
  if (project.isNull()) {
    callback(response(k404NotFound, error("Project not found")));
    return false;
  }
  if (account["role"].asString() != "super_admin" &&
      project["user_id"].asString() != account["user_id"].asString()) {
    callback(response(k403Forbidden, error("Forbidden")));
    return false;
  }
  return true;
}

constexpr const char *kArtifactColumns =
    "a.id, a.map_id, a.version, a.storage_key, a.content_type, a.byte_size, "
    "a.sha256, a.image_width, a.image_height, a.resolution, a.origin_x, "
    "a.origin_y, a.origin_theta, a.created_by, u.username AS created_by_username, "
    "a.created_at";

std::string suffix() {
  std::random_device device;
  std::mt19937_64 engine(device());
  std::ostringstream output;
  output << std::hex << engine();
  return output.str();
}

std::optional<std::string> readFile(const std::filesystem::path &path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) return std::nullopt;
  std::ostringstream bytes;
  bytes << input.rdbuf();
  if (!input.good() && !input.eof()) return std::nullopt;
  return bytes.str();
}

}  // namespace

void registerMapArtifactRoutes(const roc::config::AppConfig &config,
                               const std::string &connStr) {
  const auto jwtSecret = config.auth.jwtSecret;
  const auto mapDirectory = config.storage.mapDirectory;

  app().registerHandler(
      "/api/projects/{projectId}/maps/{mapId}/artifacts",
      [connStr, jwtSecret](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId, const std::string &mapId) {
        const auto account = principal(request, jwtSecret);
        if (!account) { callback(response(k401Unauthorized, error("Unauthorized"))); return; }
        if (!validId(projectId, callback, "project_id") || !validId(mapId, callback, "map_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          if (!allowed(pg, projectId, *account, callback)) return;
          const auto map = pg.queryOneParams(
              "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projectId});
          if (map.isNull()) { callback(response(k404NotFound, error("Map not found"))); return; }
          const auto artifacts = pg.queryParams(
              std::string("SELECT ") + kArtifactColumns +
                  " FROM map_artifacts a LEFT JOIN users u ON u.id = a.created_by "
                  "WHERE a.map_id = $1::uuid ORDER BY a.version DESC",
              {mapId});
          Json::Value body;
          body["ok"] = true;
          body["artifacts"] = artifacts;
          body["current_artifact"] = artifacts.empty() ? Json::Value(Json::nullValue) : artifacts[0];
          callback(response(k200OK, body));
        } catch (const std::exception &exception) {
          LOG_ERROR << "List map artifacts: " << exception.what();
          callback(response(k500InternalServerError, error("Unable to list map artifacts")));
        }
      },
      {Get, Options});

  app().registerHandler(
      "/api/projects/{projectId}/maps/{mapId}/artifacts",
      [connStr, jwtSecret, mapDirectory](
          const HttpRequestPtr &request,
          std::function<void(const HttpResponsePtr &)> &&callback,
          const std::string &projectId, const std::string &mapId) {
        const auto account = principal(request, jwtSecret);
        if (!account) { callback(response(k401Unauthorized, error("Unauthorized"))); return; }
        if (!validId(projectId, callback, "project_id") || !validId(mapId, callback, "map_id")) return;
        std::filesystem::path finalPath;
        std::filesystem::path temporaryPath;
        try {
          roc::db::PostgresClient pg(connStr);
          if (!allowed(pg, projectId, *account, callback)) return;
          const auto map = pg.queryOneParams(
              "SELECT image_url, resolution, coordinate_origin_x, coordinate_origin_y, "
              "origin_theta FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projectId});
          if (map.isNull() || map["image_url"].isNull()) {
            callback(response(k404NotFound, error("Map image not found")));
            return;
          }
          const auto sourceName = std::filesystem::path(map["image_url"].asString()).filename();
          const auto sourcePath = std::filesystem::path(mapDirectory) / sourceName;
          const auto bytes = readFile(sourcePath);
          if (!bytes || bytes->empty() || bytes->size() > 50 * 1024 * 1024) {
            callback(response(k422UnprocessableEntity, error("Stored map image is unavailable or invalid")));
            return;
          }
          const auto metadata = roc::utils::inspectImage(*bytes);
          if (!metadata) {
            callback(response(k422UnprocessableEntity, error("Stored map image is not a valid PNG or JPEG")));
            return;
          }
          const auto digest = roc::utils::sha256Hex(*bytes);
          const auto existing = pg.queryOneParams(
              std::string("SELECT ") + kArtifactColumns +
                  " FROM map_artifacts a LEFT JOIN users u ON u.id = a.created_by "
                  "WHERE a.map_id = $1::uuid AND a.sha256 = $2 ORDER BY a.version DESC LIMIT 1",
              {mapId, digest});
          if (!existing.isNull()) {
            Json::Value body;
            body["ok"] = true; body["created"] = false; body["artifact"] = existing;
            callback(response(k200OK, body));
            return;
          }

          pqxx::connection connection(connStr);
          pqxx::work tx(connection);
          const auto locked = tx.exec_params(
              "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
              mapId, projectId);
          if (locked.empty()) { callback(response(k404NotFound, error("Map not found"))); return; }
          const auto duplicate = tx.exec_params(
              "SELECT id::text FROM map_artifacts "
              "WHERE map_id = $1::uuid AND sha256 = $2 ORDER BY version DESC LIMIT 1",
              mapId, digest);
          if (!duplicate.empty()) {
            const auto artifactId = duplicate[0][0].as<std::string>();
            tx.commit();
            const auto artifact = pg.queryOneParams(
                std::string("SELECT ") + kArtifactColumns +
                    " FROM map_artifacts a LEFT JOIN users u ON u.id = a.created_by "
                    "WHERE a.id = $1::uuid",
                {artifactId});
            Json::Value body;
            body["ok"] = true; body["created"] = false; body["artifact"] = artifact;
            callback(response(k200OK, body));
            return;
          }
          const auto version = tx.exec_params(
              "SELECT COALESCE(MAX(version), 0) + 1 FROM map_artifacts WHERE map_id = $1::uuid",
              mapId)[0][0].as<int>();
          const auto fileName = "artifact_" + mapId.substr(0, 8) + "_v" +
              std::to_string(version) + "_" + suffix() + metadata->extension;
          finalPath = std::filesystem::path(mapDirectory) / fileName;
          temporaryPath = finalPath.string() + ".part-" + suffix();
          std::ofstream output(temporaryPath, std::ios::binary);
          output.write(bytes->data(), static_cast<std::streamsize>(bytes->size()));
          output.close();
          if (!output) throw std::runtime_error("Unable to write artifact file");
          std::error_code filesystemError;
          std::filesystem::rename(temporaryPath, finalPath, filesystemError);
          if (filesystemError) {
            std::filesystem::remove(temporaryPath, filesystemError);
            throw std::runtime_error("Unable to finalize artifact file");
          }
          temporaryPath.clear();
          const auto inserted = tx.exec_params(
              "INSERT INTO map_artifacts "
              "(map_id, version, storage_key, content_type, byte_size, sha256, image_width, "
              "image_height, resolution, origin_x, origin_y, origin_theta, created_by) VALUES "
              "($1::uuid, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, '')::double precision, "
              "NULLIF($10, '')::double precision, NULLIF($11, '')::double precision, "
              "NULLIF($12, '')::double precision, $13::uuid) "
              "RETURNING id::text",
              mapId, version, fileName, metadata->contentType,
              static_cast<long long>(bytes->size()), digest, metadata->width, metadata->height,
              map["resolution"].isNull() ? std::string{} : map["resolution"].asString(),
              map["coordinate_origin_x"].isNull() ? std::string{} : map["coordinate_origin_x"].asString(),
              map["coordinate_origin_y"].isNull() ? std::string{} : map["coordinate_origin_y"].asString(),
              map["origin_theta"].isNull() ? std::string{} : map["origin_theta"].asString(),
              (*account)["user_id"].asString());
          const auto artifactId = inserted[0][0].as<std::string>();
          tx.commit();
          finalPath.clear();

          const auto artifact = pg.queryOneParams(
              std::string("SELECT ") + kArtifactColumns +
                  " FROM map_artifacts a LEFT JOIN users u ON u.id = a.created_by "
                  "WHERE a.id = $1::uuid",
              {artifactId});
          Json::Value body;
          body["ok"] = true; body["created"] = true; body["artifact"] = artifact;
          callback(response(k201Created, body));
        } catch (const std::exception &exception) {
          if (!finalPath.empty()) {
            std::error_code ignored;
            std::filesystem::remove(finalPath, ignored);
          }
          if (!temporaryPath.empty()) {
            std::error_code ignored;
            std::filesystem::remove(temporaryPath, ignored);
          }
          LOG_ERROR << "Create map artifact: " << exception.what();
          callback(response(k500InternalServerError, error("Unable to create map artifact")));
        }
      },
      {Post, Options});
}

}  // namespace roc::controller
