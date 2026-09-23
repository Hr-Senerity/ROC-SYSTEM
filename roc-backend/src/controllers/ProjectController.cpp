#include "controllers/ProjectController.h"

#include <drogon/drogon.h>
#include <drogon/MultiPart.h>
#include <json/json.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <sys/stat.h>
#include <ctime>
#include <iomanip>
#include <random>
#include <set>
#include <vector>

#include "db/PostgresClient.h"
#include "utils/ImageMetadata.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"
#include "utils/PasswordHash.h"

namespace roc::controller {

using namespace drogon;

namespace {

constexpr std::size_t kMaxMapImageBytes = 30 * 1024 * 1024;

Json::Value makeResp(bool ok, const std::string &msg = "") {
  Json::Value v;
  v["ok"] = ok;
  if (!msg.empty()) v["message"] = msg;
  return v;
}

HttpResponsePtr jsonResp(HttpStatusCode code, const Json::Value &v) {
  auto resp = HttpResponse::newHttpJsonResponse(v);
  resp->setStatusCode(code);
  return resp;
}

std::optional<Json::Value> authReq(const HttpRequestPtr &req, const std::string &secret) {
  auto h = req->getHeader("Authorization");
  if (h.empty() || h.find("Bearer ") != 0) return std::nullopt;
  return roc::utils::verifyJwt(h.substr(7), secret);
}

enum class ProjectAccess { Allowed, NotFound, Forbidden };

ProjectAccess checkProjectAccess(roc::db::PostgresClient &pg,
                                 const std::string &projectId,
                                 const std::string &userId,
                                 const std::string &role) {
  const auto project = pg.queryOneParams(
      "SELECT user_id FROM projects WHERE id = $1::uuid", {projectId});
  if (project.isNull()) return ProjectAccess::NotFound;
  if (role != "super_admin" && project["user_id"].asString() != userId) {
    return ProjectAccess::Forbidden;
  }
  return ProjectAccess::Allowed;
}

bool respondForDeniedProject(ProjectAccess access,
                             const std::function<void(const HttpResponsePtr &)> &cb) {
  if (access == ProjectAccess::NotFound) {
    cb(jsonResp(k404NotFound, makeResp(false, "Project not found")));
    return true;
  }
  if (access == ProjectAccess::Forbidden) {
    cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden")));
    return true;
  }
  return false;
}

bool respondForInvalidId(
    const std::string &value,
    const std::function<void(const HttpResponsePtr &)> &cb,
    const std::string &field) {
  if (roc::utils::isUuid(value)) return false;
  cb(jsonResp(k400BadRequest, makeResp(false, field + " must be a UUID")));
  return true;
}

constexpr const char *kMapColumns =
    "id, project_id, name, "
    "CASE WHEN image_url IS NULL THEN NULL ELSE '/api/projects/' || project_id::text || "
    "'/maps/' || id::text || '/image' END AS image_url, "
    "is_active, coordinate_origin_x, "
    "coordinate_origin_y, coordinate_mode, image_width, image_height, "
    "resolution, origin_theta, road_network, created_at";

std::string randomUploadSuffix() {
  std::random_device device;
  std::mt19937_64 engine(device());
  std::ostringstream value;
  value << std::hex << engine();
  return value.str();
}

}  // namespace

void registerProjectRoutes(const roc::config::AppConfig &cfg, const std::string &connStr) {
  auto jwtSecret = cfg.auth.jwtSecret;
  const auto mapStorageDirectory = cfg.storage.mapDirectory;

  // GET /api/projects — list user's projects
  app().registerHandler(
      "/api/projects",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          const auto projects = role == "super_admin"
              ? pg.query(
                    "SELECT p.id, p.user_id, u.username AS owner_username, p.name, "
                    "p.description, p.status, p.created_at, p.updated_at "
                    "FROM projects p JOIN users u ON u.id = p.user_id "
                    "ORDER BY p.created_at DESC")
              : pg.queryParams(
                    "SELECT p.id, p.user_id, u.username AS owner_username, p.name, "
                    "p.description, p.status, p.created_at, p.updated_at "
                    "FROM projects p JOIN users u ON u.id = p.user_id "
                    "WHERE p.user_id = $1::uuid ORDER BY p.created_at DESC",
                    {userId});

          Json::Value resp;
          resp["ok"] = true;
          resp["projects"] = projects;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "List projects: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // POST /api/projects — create project
  app().registerHandler(
      "/api/projects",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        std::string name = (*body).get("name", "").asString();
        std::string desc = (*body).get("description", "").asString();
        if (name.empty()) { cb(jsonResp(k400BadRequest, makeResp(false, "name required"))); return; }

        std::string userId = (*p)["user_id"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          std::string id = pg.insertReturningParams(
              "INSERT INTO projects (user_id, name, description) "
              "VALUES ($1::uuid, $2, $3) RETURNING id",
              {userId, name, desc});

          auto proj = pg.queryOneParams(
              "SELECT p.id, p.user_id, u.username AS owner_username, p.name, "
              "p.description, p.status, p.created_at, p.updated_at "
              "FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1::uuid",
              {id});

          Json::Value resp;
          resp["ok"] = true;
          resp["project"] = proj;
          cb(jsonResp(k201Created, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Create project: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Post, Options});

  // GET /api/projects/{id} — get project detail
  app().registerHandler(
      "/api/projects/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto proj = pg.queryOneParams(
              "SELECT p.id, p.user_id, u.username AS owner_username, p.name, "
              "p.description, p.status, p.created_at, p.updated_at "
              "FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1::uuid",
              {projId});
          if (proj.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Not found"))); return; }
          if (role != "super_admin" && proj["user_id"].asString() != userId) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden"))); return;
          }

          Json::Value resp;
          resp["ok"] = true;
          resp["project"] = proj;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Get project: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // PATCH /api/projects/{id} — update project
  app().registerHandler(
      "/api/projects/{id}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;
        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto proj = pg.queryOneParams(
              "SELECT user_id FROM projects WHERE id = $1::uuid", {projId});
          if (proj.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Not found"))); return; }
          if (role != "super_admin" && proj["user_id"].asString() != userId) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden"))); return;
          }

          const bool updateName = body->isMember("name");
          const bool updateDescription = body->isMember("description");
          std::string name = (*body).get("name", "").asString();
          std::string desc = (*body).get("description", "").asString();
          if (updateName && name.empty()) {
            cb(jsonResp(k400BadRequest, makeResp(false, "name cannot be empty")));
            return;
          }

          auto updated = pg.queryOneParams(
              "UPDATE projects SET "
              "name = CASE WHEN $2::boolean THEN $3 ELSE name END, "
              "description = CASE WHEN $4::boolean THEN $5 ELSE description END, "
              "updated_at = NOW() WHERE id = $1::uuid "
              "RETURNING id, user_id, name, description, status, created_at, updated_at",
              {projId, updateName ? "true" : "false", name,
               updateDescription ? "true" : "false", desc});
          const auto owner = pg.queryOneParams(
              "SELECT username FROM users WHERE id = $1::uuid",
              {updated["user_id"].asString()});
          if (!owner.isNull()) updated["owner_username"] = owner["username"];
          Json::Value resp;
          resp["ok"] = true;
          resp["project"] = updated;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Update project: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Patch, Options});

  // DELETE /api/projects/{id}
  app().registerHandler(
      "/api/projects/{id}",
      [connStr, jwtSecret, mapStorageDirectory](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          std::set<std::string> storedFiles;
          pqxx::connection connection(connStr);
          pqxx::work tx(connection);
          const auto project = tx.exec_params(
              "SELECT user_id FROM projects WHERE id = $1::uuid FOR UPDATE", projId);
          if (project.empty()) {
            cb(jsonResp(k404NotFound, makeResp(false, "Not found")));
            return;
          }
          if (role != "super_admin" && project[0][0].as<std::string>() != userId) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden")));
            return;
          }

          const auto referenced = tx.exec_params(
              "SELECT 1 FROM deployment_batches "
              "WHERE project_id = $1::uuid "
              "UNION ALL "
              "SELECT 1 "
              "FROM ("
              "  SELECT artifact.id FROM map_artifacts artifact "
              "  JOIN maps map ON map.id = artifact.map_id "
              "  WHERE map.project_id = $1::uuid "
              "  UNION ALL "
              "  SELECT revision.id FROM road_network_revisions revision "
              "  JOIN maps map ON map.id = revision.map_id "
              "  WHERE map.project_id = $1::uuid"
              ") resource "
              "WHERE EXISTS ("
              "  SELECT 1 FROM deployment_batches batch "
              "  WHERE batch.resource_revision_id = resource.id"
              ") OR EXISTS ("
              "  SELECT 1 FROM vehicles vehicle "
              "  WHERE vehicle.delivered_map_artifact_id = resource.id "
              "     OR vehicle.delivered_road_revision_id = resource.id"
              ") LIMIT 1",
              projId);
          if (!referenced.empty()) {
            cb(jsonResp(k409Conflict, makeResp(
                false, "This project has delivery history and cannot be deleted")));
            return;
          }

          const auto rememberFile = [&storedFiles](const pqxx::field &field) {
            if (field.is_null()) return;
            const auto storedPath = field.as<std::string>();
            if (storedPath.empty() || storedPath.find("..") != std::string::npos) return;
            const auto fileName = std::filesystem::path(storedPath).filename().string();
            if (!fileName.empty() && fileName != "." && fileName != "..") {
              storedFiles.insert(fileName);
            }
          };
          const auto mapFiles = tx.exec_params(
              "SELECT image_url FROM maps WHERE project_id = $1::uuid", projId);
          for (const auto &map : mapFiles) rememberFile(map[0]);
          const auto artifactFiles = tx.exec_params(
              "SELECT artifact.storage_key FROM map_artifacts artifact "
              "JOIN maps map ON map.id = artifact.map_id "
              "WHERE map.project_id = $1::uuid",
              projId);
          for (const auto &artifact : artifactFiles) rememberFile(artifact[0]);

          tx.exec_params(
              "UPDATE vehicles SET map_id = NULL "
              "WHERE map_id IN (SELECT id FROM maps WHERE project_id = $1::uuid)",
              projId);
          tx.exec_params(
              "DELETE FROM road_network_revisions revision USING maps map "
              "WHERE revision.map_id = map.id AND map.project_id = $1::uuid",
              projId);
          tx.exec_params(
              "DELETE FROM map_artifacts artifact USING maps map "
              "WHERE artifact.map_id = map.id AND map.project_id = $1::uuid",
              projId);
          tx.exec_params("DELETE FROM maps WHERE project_id = $1::uuid", projId);
          tx.exec_params("DELETE FROM projects WHERE id = $1::uuid", projId);
          tx.commit();

          for (const auto &fileName : storedFiles) {
            const auto diskPath = std::filesystem::path(mapStorageDirectory) / fileName;
            std::error_code ec;
            std::filesystem::remove(diskPath, ec);
            if (ec) {
              LOG_WARN << "Project map file cleanup failed for " << diskPath << ": "
                       << ec.message();
            }
          }
          cb(jsonResp(k200OK, makeResp(true, "Deleted")));
        } catch (const pqxx::sql_error &e) {
          LOG_ERROR << "Delete project SQL error (" << e.sqlstate() << "): " << e.what();
          if (std::string(e.sqlstate()) == "23503") {
            cb(jsonResp(k409Conflict, makeResp(
                false, "This project has protected delivery references and cannot be deleted")));
          } else {
            cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
          }
        } catch (const std::exception &e) {
          LOG_ERROR << "Delete project: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  // GET /api/projects/{id}/maps — project maps
  app().registerHandler(
      "/api/projects/{id}/maps",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                std::function<void(const HttpResponsePtr &)> &&cb,
                const std::string &projId) {
        auto principal = authReq(req, jwtSecret);
        if (!principal) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*principal)["user_id"].asString(), (*principal)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;
          auto maps = pg.queryParams(
              std::string("SELECT ") + kMapColumns +
                  " FROM maps WHERE project_id = $1::uuid ORDER BY created_at DESC",
              {projId});
          Json::Value resp;
          resp["ok"] = true;
          resp["maps"] = maps;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "List maps: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // GET /api/projects/{pid}/maps/{mid} — single map with parent ownership check
  app().registerHandler(
      "/api/projects/{pid}/maps/{mid}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &projId, const std::string &mapId) {
        auto principal = authReq(req, jwtSecret);
        if (!principal) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id") ||
            respondForInvalidId(mapId, cb, "map_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*principal)["user_id"].asString(), (*principal)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;
          auto map = pg.queryOneParams(
              std::string("SELECT ") + kMapColumns +
                  " FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projId});
          if (map.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Map not found"))); return; }
          Json::Value resp;
          resp["ok"] = true;
          resp["map"] = map;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Get map: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // GET /api/projects/{pid}/maps/{mid}/image — authenticated map bytes
  app().registerHandler(
      "/api/projects/{pid}/maps/{mid}/image",
      [connStr, jwtSecret, mapStorageDirectory](
          const HttpRequestPtr &req,
          std::function<void(const HttpResponsePtr &)> &&cb,
          const std::string &projId, const std::string &mapId) {
        auto principal = authReq(req, jwtSecret);
        if (!principal) {
          cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized")));
          return;
        }
        if (respondForInvalidId(projId, cb, "project_id") ||
            respondForInvalidId(mapId, cb, "map_id")) return;
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;

          const auto map = pg.queryOneParams(
              "SELECT image_url FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projId});
          if (map.isNull() || map["image_url"].isNull()) {
            cb(jsonResp(k404NotFound, makeResp(false, "Map image not found")));
            return;
          }

          const auto storedPath = map["image_url"].asString();
          const auto fileName = std::filesystem::path(storedPath).filename();
          if (fileName.empty() || fileName == "." || fileName == "..") {
            cb(jsonResp(k404NotFound, makeResp(false, "Map image not found")));
            return;
          }
          const auto diskPath = std::filesystem::path(mapStorageDirectory) / fileName;
          std::error_code ec;
          if (!std::filesystem::is_regular_file(diskPath, ec) || ec) {
            cb(jsonResp(k404NotFound, makeResp(false, "Map image not found")));
            return;
          }

          auto response = HttpResponse::newFileResponse(diskPath.string());
          response->addHeader("Cache-Control", "private, max-age=300");
          response->addHeader("X-Content-Type-Options", "nosniff");
          cb(response);
        } catch (const std::exception &e) {
          LOG_ERROR << "Get map image: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Get, Options});

  // POST /api/projects/{id}/maps/upload — multipart image upload
  app().registerHandler(
      "/api/projects/{id}/maps/upload",
      [connStr, jwtSecret, mapStorageDirectory](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;
        MultiPartParser parser;
        if (parser.parse(req) != 0) {
          cb(jsonResp(k400BadRequest, makeResp(
              false, "multipart/form-data with name and image fields is required")));
          return;
        }
        const auto &parameters = parser.getParameters();
        const auto name = parameters.find("name");
        const auto files = parser.getFilesMap();
        const auto file = files.find("image");
        if (name == parameters.end() || name->second.empty()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "name is required")));
          return;
        }
        if (name->second.size() > 128) {
          cb(jsonResp(k400BadRequest, makeResp(false, "name is too long")));
          return;
        }
        if (file == files.end() || file->second.fileLength() == 0) {
          cb(jsonResp(k400BadRequest, makeResp(false, "image is required")));
          return;
        }
        if (file->second.fileLength() > kMaxMapImageBytes) {
          cb(jsonResp(k413RequestEntityTooLarge,
                      makeResp(false, "Image exceeds the 30 MiB upload limit")));
          return;
        }
        const std::string mapName = name->second;
        const auto content = file->second.fileContent();
        std::string raw(content.data(), content.size());
        const auto image = roc::utils::inspectImage(raw);
        if (!image) {
          cb(jsonResp(k400BadRequest, makeResp(false, "Only PNG and JPEG images are supported")));
          return;
        }
        std::string fn = "map_" + projId.substr(0, 8) + "_" + randomUploadSuffix() + image->extension;
        std::string savedPath = "/static/maps/" + fn;
        const auto d = mapStorageDirectory;
        const auto diskPath = std::filesystem::path(d) / fn;
        const auto temporaryPath = std::filesystem::path(d) / (fn + ".part-" + randomUploadSuffix());
        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*p)["user_id"].asString(), (*p)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;

          std::error_code ec;
          std::filesystem::create_directories(d, ec);
          if (ec) { cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to create upload directory"))); return; }
          std::ofstream ofs(temporaryPath, std::ios::binary);
          if (!ofs) { cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to write file"))); return; }
          ofs.write(raw.data(), static_cast<std::streamsize>(raw.size()));
          ofs.close();
          if (!ofs) {
            std::filesystem::remove(temporaryPath, ec);
            cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to write file")));
            return;
          }
          std::filesystem::rename(temporaryPath, diskPath, ec);
          if (ec) {
            std::filesystem::remove(temporaryPath, ec);
            cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to finalize file")));
            return;
          }

          std::string mid;
          try {
            pqxx::connection connection(connStr);
            pqxx::work tx(connection);
            const auto inserted = tx.exec_params(
                "INSERT INTO maps (project_id, name, image_url, image_width, image_height) "
                "VALUES ($1::uuid, $2, $3, $4, $5) RETURNING id::text",
                projId, mapName, savedPath, image->width, image->height);
            mid = inserted[0][0].as<std::string>();
            tx.exec_params(
                "INSERT INTO map_artifacts "
                "(map_id, version, storage_key, content_type, byte_size, sha256, "
                "image_width, image_height, created_by) "
                "VALUES ($1::uuid, 1, $2, $3, $4, $5, $6, $7, $8::uuid)",
                mid, fn, image->contentType, static_cast<long long>(raw.size()),
                roc::utils::sha256Hex(raw), image->width, image->height,
                (*p)["user_id"].asString());
            tx.commit();
          } catch (...) {
            std::filesystem::remove(diskPath, ec);
            throw;
          }
          auto m = pg.queryOneParams(
              std::string("SELECT ") + kMapColumns + " FROM maps WHERE id = $1::uuid",
              {mid});
          Json::Value resp; resp["ok"] = true; resp["map"] = m;
          cb(jsonResp(k201Created, resp));
        } catch (const std::exception &e) { LOG_ERROR << "Upload: " << e.what(); cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error"))); }
      }, {Post, Options});

  // PUT /api/projects/{pid}/default-map — atomically switch the default map
  app().registerHandler(
      "/api/projects/{pid}/default-map",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                          std::function<void(const HttpResponsePtr &)> &&cb,
                          const std::string &projId) {
        auto principal = authReq(req, jwtSecret);
        if (!principal) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id")) return;
        auto body = req->getJsonObject();
        if (!body || !body->isMember("map_id") || !(*body)["map_id"].isString()) {
          cb(jsonResp(k400BadRequest, makeResp(false, "map_id required")));
          return;
        }
        const auto mapId = (*body)["map_id"].asString();
        if (respondForInvalidId(mapId, cb, "map_id")) return;
        try {
          pqxx::connection connection(connStr);
          pqxx::work tx(connection);
          const auto project = tx.exec_params(
              "SELECT user_id FROM projects WHERE id = $1::uuid FOR UPDATE", projId);
          if (project.empty()) { cb(jsonResp(k404NotFound, makeResp(false, "Project not found"))); return; }
          if ((*principal)["role"].asString() != "super_admin" &&
              project[0][0].as<std::string>() != (*principal)["user_id"].asString()) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden")));
            return;
          }
          const auto map = tx.exec_params(
              "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              mapId, projId);
          if (map.empty()) { cb(jsonResp(k404NotFound, makeResp(false, "Map not found"))); return; }
          tx.exec_params("UPDATE maps SET is_active = false WHERE project_id = $1::uuid", projId);
          tx.exec_params(
              "UPDATE maps SET is_active = true WHERE id = $1::uuid AND project_id = $2::uuid",
              mapId, projId);
          tx.commit();
          Json::Value resp;
          resp["ok"] = true;
          resp["default_map_id"] = mapId;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Set default map: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Put, Options});

  // PATCH /api/projects/{pid}/maps/{mid} — rename map
  app().registerHandler(
      "/api/projects/{pid}/maps/{mid}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId, const std::string &mapId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id") ||
            respondForInvalidId(mapId, cb, "map_id")) return;
        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*p)["user_id"].asString(), (*p)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;
          auto m = pg.queryOneParams(
              "SELECT id FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projId});
          if (m.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Map not found"))); return; }

          std::vector<std::string> assignments;
          std::vector<std::string> params;
          auto addParam = [&](const std::string &column, const std::string &cast,
                              const std::string &value) {
            params.push_back(value);
            assignments.push_back(column + " = $" + std::to_string(params.size()) + cast);
          };
          if (body->isMember("name")) {
            const auto name = (*body)["name"].asString();
            if (name.empty()) { cb(jsonResp(k400BadRequest, makeResp(false, "name cannot be empty"))); return; }
            addParam("name", "", name);
          }
          if (body->isMember("coordinate_origin_x")) addParam("coordinate_origin_x", "::double precision", (*body)["coordinate_origin_x"].asString());
          if (body->isMember("coordinate_origin_y")) addParam("coordinate_origin_y", "::double precision", (*body)["coordinate_origin_y"].asString());
          if (body->isMember("resolution")) addParam("resolution", "::double precision", (*body)["resolution"].asString());
          if (body->isMember("origin_theta")) addParam("origin_theta", "::double precision", (*body)["origin_theta"].asString());
          if (body->isMember("road_network")) addParam("road_network", "::jsonb", (*body)["road_network"].toStyledString());
          if (assignments.empty()) { cb(jsonResp(k400BadRequest, makeResp(false, "No supported fields"))); return; }
          std::ostringstream update;
          update << "UPDATE maps SET ";
          for (size_t i = 0; i < assignments.size(); ++i) {
            if (i > 0) update << ", ";
            update << assignments[i];
          }
          params.push_back(mapId);
          params.push_back(projId);
          update << " WHERE id = $" << params.size() - 1 << "::uuid AND project_id = $"
                 << params.size() << "::uuid";
          pg.executeParams(update.str(), params);

          auto updated = pg.queryOneParams(
              std::string("SELECT ") + kMapColumns +
                  " FROM maps WHERE id = $1::uuid AND project_id = $2::uuid",
              {mapId, projId});
          Json::Value resp;
          resp["ok"] = true;
          resp["map"] = updated;
          cb(jsonResp(k200OK, resp));
        } catch (const std::exception &e) {
          LOG_ERROR << "Update map: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Patch, Options});

  // DELETE /api/projects/{pid}/maps/{mid}
  app().registerHandler(
      "/api/projects/{pid}/maps/{mid}",
      [connStr, jwtSecret, mapStorageDirectory](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId, const std::string &mapId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        if (respondForInvalidId(projId, cb, "project_id") ||
            respondForInvalidId(mapId, cb, "map_id")) return;

        try {
          roc::db::PostgresClient pg(connStr);
          const auto access = checkProjectAccess(
              pg, projId, (*p)["user_id"].asString(), (*p)["role"].asString());
          if (respondForDeniedProject(access, cb)) return;
          const auto bound = pg.queryOneParams(
              "SELECT id FROM vehicles WHERE map_id = $1::uuid LIMIT 1", {mapId});
          if (!bound.isNull()) {
            cb(jsonResp(k409Conflict, makeResp(false, "Unbind vehicles before deleting this map")));
            return;
          }
          std::vector<std::string> storedFiles;
          pqxx::connection connection(connStr);
          pqxx::work tx(connection);
          const auto map = tx.exec_params(
              "SELECT image_url FROM maps "
              "WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
              mapId, projId);
          if (map.empty()) {
            cb(jsonResp(k404NotFound, makeResp(false, "Map not found")));
            return;
          }
          const auto referenced = tx.exec_params(
              "SELECT 1 "
              "FROM ("
              "  SELECT id FROM map_artifacts WHERE map_id = $1::uuid "
              "  UNION ALL "
              "  SELECT id FROM road_network_revisions WHERE map_id = $1::uuid"
              ") resource "
              "WHERE EXISTS ("
              "  SELECT 1 FROM deployment_batches batch "
              "  WHERE batch.resource_revision_id = resource.id"
              ") OR EXISTS ("
              "  SELECT 1 FROM vehicles vehicle "
              "  WHERE vehicle.delivered_map_artifact_id = resource.id "
              "     OR vehicle.delivered_road_revision_id = resource.id"
              ") LIMIT 1",
              mapId);
          if (!referenced.empty()) {
            cb(jsonResp(k409Conflict, makeResp(
                false, "This map has delivery history and cannot be deleted")));
            return;
          }
          const auto artifacts = tx.exec_params(
              "SELECT storage_key FROM map_artifacts WHERE map_id = $1::uuid", mapId);
          for (const auto &artifact : artifacts) {
            storedFiles.push_back(artifact[0].as<std::string>());
          }
          const auto imagePath = map[0][0].as<std::string>();
          if (imagePath.rfind("/static/maps/", 0) == 0 &&
              imagePath.find("..") == std::string::npos) {
            storedFiles.push_back(std::filesystem::path(imagePath).filename().string());
          }
          tx.exec_params("DELETE FROM road_network_revisions WHERE map_id = $1::uuid", mapId);
          tx.exec_params("DELETE FROM map_artifacts WHERE map_id = $1::uuid", mapId);
          tx.exec_params(
              "DELETE FROM maps WHERE id = $1::uuid AND project_id = $2::uuid", mapId, projId);
          tx.commit();

          for (const auto &storageKey : storedFiles) {
            if (storageKey.empty() || storageKey.find("..") != std::string::npos) continue;
            const auto diskPath = std::filesystem::path(mapStorageDirectory) /
                                  std::filesystem::path(storageKey).filename();
            std::error_code ec;
            std::filesystem::remove(diskPath, ec);
            if (ec) LOG_WARN << "Map file cleanup failed for " << diskPath << ": " << ec.message();
          }
          cb(jsonResp(k200OK, makeResp(true, "Map deleted")));
        } catch (const std::exception &e) {
          LOG_ERROR << "Delete map: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  LOG_INFO << "Project routes registered";
}

}  // namespace roc::controller
