#include "controllers/DeploymentController.h"

#include <filesystem>
#include <functional>
#include <optional>
#include <string>
#include <vector>

#include <drogon/drogon.h>
#include <json/json.h>
#include <pqxx/pqxx>

#include "controllers/DeviceWsController.h"
#include "controllers/StatusWsController.h"
#include "services/DeploymentService.h"
#include "utils/InputValidation.h"
#include "utils/JwtHelper.h"

namespace roc::controller {
namespace {

using namespace drogon;

HttpResponsePtr jsonResponse(int status, const Json::Value &body) {
  auto response = HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(static_cast<HttpStatusCode>(status));
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

std::optional<Json::Value> accountPrincipal(const HttpRequestPtr &request,
                                            const std::string &secret) {
  const auto header = request->getHeader("Authorization");
  if (header.rfind("Bearer ", 0) != 0) return std::nullopt;
  return roc::utils::verifyJwt(header.substr(7), secret);
}

std::string deviceToken(const HttpRequestPtr &request) {
  const auto header = request->getHeader("Authorization");
  if (header.rfind("Device ", 0) != 0) return {};
  return header.substr(7);
}

bool validUuid(const std::string &value,
               const std::function<void(const HttpResponsePtr &)> &callback,
               const std::string &field) {
  if (roc::utils::isUuid(value)) return true;
  callback(jsonResponse(400, errorBody("invalid_id", field + " must be a UUID")));
  return false;
}

void sendResult(
    const roc::service::DeploymentResult &result,
    const std::function<void(const HttpResponsePtr &)> &callback) {
  callback(jsonResponse(result.status, result.body));
}

std::optional<roc::service::DeviceIdentity> authenticateDevice(
    const HttpRequestPtr &request,
    const roc::service::DeploymentService &service) {
  const auto token = deviceToken(request);
  if (token.empty()) return std::nullopt;
  return service.authenticateDevice(token);
}

void notifyTasks(const Json::Value &deployment) {
  if (!deployment.isObject() || !deployment["tasks"].isArray()) return;
  for (const auto &task : deployment["tasks"]) {
    if (task.isMember("vehicle_id")) {
      roc::ws::DeviceWsController::notifyPendingTasks(
          task["vehicle_id"].asString());
    }
  }
}

}  // namespace

void registerDeploymentRoutes(const roc::config::AppConfig &config,
                              const std::string &connStr) {
  const auto jwtSecret = config.auth.jwtSecret;
  const auto mapDirectory = config.storage.mapDirectory;
  const auto taskLeaseSeconds = config.deployment.taskLeaseSeconds;

  app().registerHandler(
      "/api/projects/{projectId}/deployments",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId) {
        const auto principal = accountPrincipal(request, jwtSecret);
        if (!principal) {
          callback(jsonResponse(401, errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!validUuid(projectId, callback, "project_id")) return;
        const auto body = request->getJsonObject();
        if (!body || !body->isObject()) {
          callback(jsonResponse(
              400, errorBody("invalid_json", "JSON object is required")));
          return;
        }

        const auto resourceType = body->get("resource_type", "").asString();
        const auto revisionId =
            body->get("resource_revision_id", "").asString();
        const auto idempotencyKey =
            body->get("idempotency_key", "").asString();
        if (!validUuid(revisionId, callback, "resource_revision_id")) return;
        if (!(*body)["vehicle_ids"].isArray()) {
          callback(jsonResponse(
              400, errorBody("invalid_vehicles", "vehicle_ids must be an array")));
          return;
        }
        std::vector<std::string> vehicleIds;
        for (const auto &item : (*body)["vehicle_ids"]) {
          if (!item.isString() || !roc::utils::isUuid(item.asString())) {
            callback(jsonResponse(
                400, errorBody("invalid_vehicles",
                               "Every vehicle_id must be a UUID")));
            return;
          }
          vehicleIds.push_back(item.asString());
        }

        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          auto result = service.createBatch(
              projectId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString(), resourceType, revisionId,
              vehicleIds, idempotencyKey);
          if (result.ok()) {
            notifyTasks(result.body["deployment"]);
            roc::ws::StatusWsController::broadcastProjectEvent(
                "deployment_created", projectId, "deployment",
                result.body["deployment"]);
            result.status = 201;
          }
          sendResult(result, callback);
        } catch (const pqxx::sql_error &error) {
          LOG_ERROR << "Create deployment SQL error: " << error.what();
          callback(jsonResponse(
              409, errorBody("deployment_rejected",
                             "Resource or target vehicle is not eligible")));
        } catch (const std::exception &error) {
          LOG_ERROR << "Create deployment error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to create deployment")));
        }
      },
      {Post});

  app().registerHandler(
      "/api/projects/{projectId}/deployments/{batchId}",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId,
                           const std::string &batchId) {
        const auto principal = accountPrincipal(request, jwtSecret);
        if (!principal) {
          callback(jsonResponse(401, errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!validUuid(projectId, callback, "project_id") ||
            !validUuid(batchId, callback, "deployment_id")) {
          return;
        }
        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          sendResult(service.getBatch(
                         projectId, batchId,
                         (*principal)["user_id"].asString(),
                         (*principal)["role"].asString()),
                     callback);
        } catch (const std::exception &error) {
          LOG_ERROR << "Get deployment error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to read deployment")));
        }
      },
      {Get});

  app().registerHandler(
      "/api/projects/{projectId}/deployments/{batchId}/cancel",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &projectId,
                           const std::string &batchId) {
        const auto principal = accountPrincipal(request, jwtSecret);
        if (!principal) {
          callback(jsonResponse(401, errorBody("unauthorized", "Unauthorized")));
          return;
        }
        if (!validUuid(projectId, callback, "project_id") ||
            !validUuid(batchId, callback, "deployment_id")) {
          return;
        }
        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          auto result = service.cancelBatch(
              projectId, batchId, (*principal)["user_id"].asString(),
              (*principal)["role"].asString());
          if (result.ok()) {
            roc::ws::StatusWsController::broadcastProjectEvent(
                "deployment_updated", projectId, "deployment",
                result.body["deployment"]);
          }
          sendResult(result, callback);
        } catch (const std::exception &error) {
          LOG_ERROR << "Cancel deployment error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to cancel deployment")));
        }
      },
      {Post});

  app().registerHandler(
      "/api/device/tasks/{taskId}/accept",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &taskId) {
        if (!validUuid(taskId, callback, "task_id")) return;
        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          const auto device = authenticateDevice(request, service);
          if (!device) {
            callback(jsonResponse(
                401, errorBody("authentication_failed", "Invalid device token")));
            return;
          }
          auto result = service.acceptTask(*device, taskId);
          if (result.ok()) {
            roc::ws::StatusWsController::broadcastProjectEvent(
                "deployment_task_updated", device->projectId, "task",
                result.body["task"]);
          }
          sendResult(result, callback);
        } catch (const std::exception &error) {
          LOG_ERROR << "Accept device task error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to accept task")));
        }
      },
      {Post});

  app().registerHandler(
      "/api/device/tasks/{taskId}/manifest",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &taskId) {
        if (!validUuid(taskId, callback, "task_id")) return;
        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          const auto device = authenticateDevice(request, service);
          if (!device) {
            callback(jsonResponse(
                401, errorBody("authentication_failed", "Invalid device token")));
            return;
          }
          sendResult(service.getManifest(
                         *device, taskId, request->getHeader("X-Task-Lease")),
                     callback);
        } catch (const std::exception &error) {
          LOG_ERROR << "Get device manifest error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to read manifest")));
        }
      },
      {Get});

  app().registerHandler(
      "/api/device/tasks/{taskId}/artifact",
      [connStr, jwtSecret, mapDirectory, taskLeaseSeconds](
          const HttpRequestPtr &request,
          std::function<void(const HttpResponsePtr &)> &&callback,
          const std::string &taskId) {
        if (!validUuid(taskId, callback, "task_id")) return;
        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          const auto device = authenticateDevice(request, service);
          if (!device) {
            callback(jsonResponse(
                401, errorBody("authentication_failed", "Invalid device token")));
            return;
          }
          const auto result = service.getArtifact(
              *device, taskId, request->getHeader("X-Task-Lease"));
          if (!result.ok()) {
            sendResult(result, callback);
            return;
          }
          if (!request->getHeader("Range").empty()) {
            callback(jsonResponse(
                416, errorBody("range_not_supported",
                               "Partial artifact downloads are not supported")));
            return;
          }
          if (result.body["resource_type"].asString() == "road_network") {
            auto response =
                HttpResponse::newHttpJsonResponse(result.body["network"]);
            response->setContentTypeString(
                result.body["content_type"].asString());
            response->addHeader("X-Content-SHA256",
                                result.body["sha256"].asString());
            response->addHeader("Cache-Control", "no-store");
            callback(response);
            return;
          }

          const auto fileName = std::filesystem::path(
                                    result.body["storage_key"].asString())
                                    .filename();
          if (fileName.empty() || fileName == "." || fileName == "..") {
            callback(jsonResponse(
                404, errorBody("artifact_not_found", "Artifact not found")));
            return;
          }
          const auto path = std::filesystem::path(mapDirectory) / fileName;
          std::error_code error;
          if (!std::filesystem::is_regular_file(path, error) || error) {
            callback(jsonResponse(
                404, errorBody("artifact_not_found", "Artifact not found")));
            return;
          }
          auto response = HttpResponse::newFileResponse(path.string());
          response->setContentTypeString(
              result.body["content_type"].asString());
          response->addHeader("X-Content-SHA256",
                              result.body["sha256"].asString());
          response->addHeader("Cache-Control", "no-store");
          response->addHeader("X-Content-Type-Options", "nosniff");
          callback(response);
        } catch (const std::exception &error) {
          LOG_ERROR << "Get device artifact error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to read artifact")));
        }
      },
      {Get});

  app().registerHandler(
      "/api/device/tasks/{taskId}/status",
      [connStr, jwtSecret, taskLeaseSeconds](const HttpRequestPtr &request,
                           std::function<void(const HttpResponsePtr &)> &&callback,
                           const std::string &taskId) {
        if (!validUuid(taskId, callback, "task_id")) return;
        const auto body = request->getJsonObject();
        if (!body || !body->isObject()) {
          callback(jsonResponse(
              400, errorBody("invalid_json", "JSON object is required")));
          return;
        }
        const auto eventId = body->get("event_id", "").asString();
        if (!validUuid(eventId, callback, "event_id")) return;
        const auto state = body->get("state", "").asString();
        if (!body->isMember("progress") || !(*body)["progress"].isInt()) {
          callback(jsonResponse(
              400, errorBody("invalid_progress", "progress must be an integer")));
          return;
        }

        try {
          roc::service::DeploymentService service(
              connStr, jwtSecret, taskLeaseSeconds);
          const auto device = authenticateDevice(request, service);
          if (!device) {
            callback(jsonResponse(
                401, errorBody("authentication_failed", "Invalid device token")));
            return;
          }
          auto result = service.updateTaskStatus(
              *device, taskId, request->getHeader("X-Task-Lease"), eventId,
              state, (*body)["progress"].asInt(),
              body->get("error_code", "").asString(),
              body->get("error_message", "").asString());
          if (result.ok()) {
            roc::ws::StatusWsController::broadcastProjectEvent(
                "deployment_task_updated", device->projectId, "task",
                result.body["task"]);
          }
          sendResult(result, callback);
        } catch (const std::exception &error) {
          LOG_ERROR << "Update device task error: " << error.what();
          callback(jsonResponse(
              500, errorBody("internal_error", "Unable to update task")));
        }
      },
      {Post});
}

}  // namespace roc::controller
