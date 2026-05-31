#include "controllers/ProjectController.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <sys/stat.h>
#include <ctime>

#include "db/PostgresClient.h"
#include "utils/JwtHelper.h"

namespace roc::controller {

using namespace drogon;

namespace {

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

std::string esc(const std::string &s) {
  std::string o;
  o.reserve(s.size() * 2);
  for (char c : s) { if (c == '\'') o += "''"; else o += c; }
  return o;
}

}  // namespace

void registerProjectRoutes(const roc::config::AppConfig &cfg, const std::string &connStr) {
  auto jwtSecret = cfg.auth.jwtSecret;

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
          std::string sql = role == "super_admin"
              ? "SELECT id, user_id, name, description, status, created_at, updated_at FROM projects ORDER BY created_at DESC"
              : "SELECT id, user_id, name, description, status, created_at, updated_at FROM projects WHERE user_id = '" + esc(userId) + "' ORDER BY created_at DESC";
          auto projects = pg.query(sql);

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
          std::string id = pg.insertReturning(
              "INSERT INTO projects (user_id, name, description) VALUES ('" +
              esc(userId) + "', '" + esc(name) + "', '" + esc(desc) + "') RETURNING id");

          auto proj = pg.queryOne("SELECT id, user_id, name, description, status, created_at, updated_at FROM projects WHERE id = '" + esc(id) + "'");

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

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          std::string sql = "SELECT id, user_id, name, description, status, created_at, updated_at FROM projects WHERE id = '" + esc(projId) + "'";
          auto proj = pg.queryOne(sql);
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
        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto proj = pg.queryOne("SELECT user_id FROM projects WHERE id = '" + esc(projId) + "'");
          if (proj.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Not found"))); return; }
          if (role != "super_admin" && proj["user_id"].asString() != userId) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden"))); return;
          }

          std::string name = (*body).get("name", "").asString();
          std::string desc = (*body).get("description", "").asString();

          std::ostringstream sql;
          sql << "UPDATE projects SET updated_at = NOW()";
          if (!name.empty()) sql << ", name = '" << esc(name) << "'";
          if (body->isMember("description")) sql << ", description = '" << esc(desc) << "'";
          sql << " WHERE id = '" << esc(projId) << "'";
          pg.execute(sql.str());

          auto updated = pg.queryOne("SELECT id, user_id, name, description, status, created_at, updated_at FROM projects WHERE id = '" + esc(projId) + "'");
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
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        std::string userId = (*p)["user_id"].asString();
        std::string role = (*p)["role"].asString();

        try {
          roc::db::PostgresClient pg(connStr);
          auto proj = pg.queryOne("SELECT user_id FROM projects WHERE id = '" + esc(projId) + "'");
          if (proj.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Not found"))); return; }
          if (role != "super_admin" && proj["user_id"].asString() != userId) {
            cb(jsonResp(k403Forbidden, makeResp(false, "Forbidden"))); return;
          }

          pg.execute("DELETE FROM projects WHERE id = '" + esc(projId) + "'");
          cb(jsonResp(k200OK, makeResp(true, "Deleted")));
        } catch (const std::exception &e) {
          LOG_ERROR << "Delete project: " << e.what();
          cb(jsonResp(k500InternalServerError, makeResp(false, "Internal error")));
        }
      },
      {Delete, Options});

  // GET /api/projects/{id}/maps — project maps
  app().registerHandler(
      "/api/projects/{id}/maps",
      [connStr](const HttpRequestPtr &,
                std::function<void(const HttpResponsePtr &)> &&cb,
                const std::string &projId) {
        try {
          roc::db::PostgresClient pg(connStr);
          auto maps = pg.query("SELECT id, project_id, name, image_url, is_active, coordinate_origin_x, coordinate_origin_y, road_network, created_at FROM maps WHERE project_id = '" + esc(projId) + "' ORDER BY created_at DESC");
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

  // POST /api/projects/{id}/maps/upload — JSON base64 upload
  app().registerHandler(
      "/api/projects/{id}/maps/upload",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &projId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }
        std::string b64 = (*body).get("image_base64", "").asString();
        std::string mapName = (*body).get("name", "Untitled").asString();
        if (b64.empty()) { cb(jsonResp(k400BadRequest, makeResp(false, "image_base64 required"))); return; }
        std::string raw = drogon::utils::base64Decode(b64);
        std::string fn = "map_" + projId.substr(0,8) + "_" + std::to_string(time(nullptr)) + ".png";
        std::string savedPath = "/static/maps/" + fn;
        auto d = drogon::app().getDocumentRoot() + "/static/maps";
        std::error_code ec;
        std::filesystem::create_directories(d, ec);
        if (ec) { cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to create upload directory"))); return; }
        std::ofstream ofs(d + "/" + fn, std::ios::binary);
        if (!ofs) { cb(jsonResp(k500InternalServerError, makeResp(false, "Failed to write file"))); return; }
        ofs.write(raw.data(), raw.size()); ofs.close();
        try {
          roc::db::PostgresClient pg(connStr);
          std::string sq = "'";
          std::string mid = pg.insertReturning("INSERT INTO maps (project_id,name,image_url) VALUES (" + sq + esc(projId) + sq + "," + sq + esc(mapName) + sq + "," + sq + esc(savedPath) + sq + ") RETURNING id");
          auto m = pg.queryOne("SELECT id,project_id,name,image_url,is_active,coordinate_origin_x,coordinate_origin_y,road_network,created_at FROM maps WHERE id=" + sq + esc(mid) + sq);
          Json::Value resp; resp["ok"] = true; resp["map"] = m;
          cb(jsonResp(k201Created, resp));
        } catch (const std::exception &e) { LOG_ERROR << "Upload: " << e.what(); cb(jsonResp(k500InternalServerError, makeResp(false, "Error"))); }
      }, {Post, Options});

  // PATCH /api/projects/{pid}/maps/{mid} — rename map
  app().registerHandler(
      "/api/projects/{pid}/maps/{mid}",
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &, const std::string &mapId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }
        auto body = req->getJsonObject();
        if (!body) { cb(jsonResp(k400BadRequest, makeResp(false, "Invalid JSON"))); return; }

        try {
          roc::db::PostgresClient pg(connStr);
          auto m = pg.queryOne("SELECT id FROM maps WHERE id = '" + esc(mapId) + "'");
          if (m.isNull()) { cb(jsonResp(k404NotFound, makeResp(false, "Map not found"))); return; }

          if (body->isMember("name")) {
            pg.execute("UPDATE maps SET name = '" + esc((*body)["name"].asString()) + "' WHERE id = '" + esc(mapId) + "'");
          }
          if (body->isMember("coordinate_origin_x")) {
            pg.execute("UPDATE maps SET coordinate_origin_x = " + std::to_string((*body)["coordinate_origin_x"].asDouble()) + " WHERE id = '" + esc(mapId) + "'");
          }
          if (body->isMember("coordinate_origin_y")) {
            pg.execute("UPDATE maps SET coordinate_origin_y = " + std::to_string((*body)["coordinate_origin_y"].asDouble()) + " WHERE id = '" + esc(mapId) + "'");
          }
          if (body->isMember("road_network")) {
            std::string rnJson = (*body)["road_network"].toStyledString();
            pg.execute("UPDATE maps SET road_network = '" + esc(rnJson) + "'::jsonb WHERE id = '" + esc(mapId) + "'");
          }

          auto updated = pg.queryOne(
              "SELECT id, project_id, name, image_url, is_active, coordinate_origin_x, coordinate_origin_y, road_network, created_at FROM maps WHERE id = '" + esc(mapId) + "'");
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
      [connStr, jwtSecret](const HttpRequestPtr &req,
                            std::function<void(const HttpResponsePtr &)> &&cb,
                            const std::string &, const std::string &mapId) {
        auto p = authReq(req, jwtSecret);
        if (!p) { cb(jsonResp(k401Unauthorized, makeResp(false, "Unauthorized"))); return; }

        try {
          roc::db::PostgresClient pg(connStr);
          pg.execute("DELETE FROM maps WHERE id = '" + esc(mapId) + "'");
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
