#include <filesystem>
#include <fstream>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <json/json.h>

namespace {

const std::filesystem::path kSchemaDirectory{ROC_SCHEMA_DIR};

void require(bool condition, const std::string &message) {
  if (!condition) throw std::runtime_error(message);
}

Json::Value readJson(const std::string &fileName) {
  const auto path = kSchemaDirectory / fileName;
  std::ifstream input(path, std::ios::binary);
  require(static_cast<bool>(input), "Unable to open " + path.string());

  Json::CharReaderBuilder builder;
  builder["collectComments"] = false;
  Json::Value root;
  std::string errors;
  require(Json::parseFromStream(builder, input, &root, &errors),
          "Invalid JSON in " + path.string() + ": " + errors);
  require(root.isObject(), fileName + " must contain a JSON object");
  return root;
}

bool arrayContains(const Json::Value &array, const std::string &value) {
  if (!array.isArray()) return false;
  for (const auto &item : array) {
    if (item.isString() && item.asString() == value) return true;
  }
  return false;
}

void validateJsonSchemas() {
  const auto device = readJson("device-protocol-v1.schema.json");
  require(device["$schema"].asString() ==
              "https://json-schema.org/draft/2020-12/schema",
          "Device protocol must use JSON Schema 2020-12");
  require(device["additionalProperties"].isBool() &&
              !device["additionalProperties"].asBool(),
          "Device envelope must reject unknown top-level properties");
  const auto deviceTypes = device["properties"]["type"]["enum"];
  require(arrayContains(deviceTypes, "heartbeat") &&
              arrayContains(deviceTypes, "telemetry"),
          "Device protocol must retain heartbeat and telemetry");

  const auto road = readJson("road-network-v1.schema.json");
  require(road["properties"]["schema_version"]["const"].asInt() == 1,
          "Road-network schema version must remain 1");
  require(road["$defs"].isMember("node") && road["$defs"].isMember("edge"),
          "Road-network schema must define nodes and edges");

  const auto deployment = readJson("deployment-task-v1.schema.json");
  for (const auto *definition : {"taskAvailable", "statusRequest",
                                 "manifestResponse"}) {
    require(deployment["$defs"].isMember(definition),
            std::string("Deployment schema is missing ") + definition);
  }
}

void validateOpenApi() {
  const auto api = readJson("openapi-v1.json");
  require(api["openapi"].asString() == "3.1.0",
          "OpenAPI version must be 3.1.0");
  require(api["components"]["securitySchemes"].isMember("accountBearer"),
          "OpenAPI is missing accountBearer");
  require(api["components"]["securitySchemes"].isMember("deviceBearer"),
          "OpenAPI is missing deviceBearer");

  const std::vector<std::pair<std::string, std::string>> expectedOperations{
      {"/api/health", "get"},
      {"/api/db/ping", "get"},
      {"/api/auth/register", "post"},
      {"/api/auth/login", "post"},
      {"/api/auth/me", "get"},
      {"/api/auth/change-password", "post"},
      {"/api/auth/logout", "post"},
      {"/api/projects", "get"},
      {"/api/projects", "post"},
      {"/api/projects/{id}", "get"},
      {"/api/projects/{id}", "patch"},
      {"/api/projects/{id}", "delete"},
      {"/api/projects/{id}/maps", "get"},
      {"/api/projects/{pid}/maps/{mid}", "get"},
      {"/api/projects/{pid}/maps/{mid}", "patch"},
      {"/api/projects/{pid}/maps/{mid}", "delete"},
      {"/api/projects/{pid}/maps/{mid}/image", "get"},
      {"/api/projects/{id}/maps/upload", "post"},
      {"/api/projects/{pid}/default-map", "put"},
      {"/api/projects/{projectId}/maps/{mapId}/artifacts", "get"},
      {"/api/projects/{projectId}/maps/{mapId}/artifacts", "post"},
      {"/api/projects/{projectId}/maps/{mapId}/road-network/revisions", "get"},
      {"/api/projects/{projectId}/maps/{mapId}/road-network/revisions", "post"},
      {"/api/projects/{projectId}/maps/{mapId}/road-network/revisions/{revisionId}", "get"},
      {"/api/vehicles", "get"},
      {"/api/vehicles", "post"},
      {"/api/vehicles/{id}", "patch"},
      {"/api/vehicles/{id}", "delete"},
      {"/api/vehicles/{id}/device-token", "get"},
      {"/api/vehicles/{id}/device-token", "post"},
      {"/api/vehicles/{id}/device-token", "delete"},
      {"/api/projects/{projectId}/deployments", "post"},
      {"/api/projects/{projectId}/deployments/{batchId}", "get"},
      {"/api/projects/{projectId}/deployments/{batchId}/cancel", "post"},
      {"/api/device/tasks/{taskId}/accept", "post"},
      {"/api/device/tasks/{taskId}/manifest", "get"},
      {"/api/device/tasks/{taskId}/artifact", "get"},
      {"/api/device/tasks/{taskId}/status", "post"},
      {"/api/admin/users", "get"},
      {"/api/admin/users/{id}", "get"},
      {"/api/admin/users/{id}", "delete"},
      {"/api/admin/users/{id}/status", "patch"},
      {"/api/admin/users/{id}/vehicles", "get"},
      {"/api/admin/invitation-codes", "get"},
      {"/api/admin/invitation-codes", "post"},
      {"/api/admin/invitation-codes/{id}", "delete"},
      {"/api/admin/stats", "get"},
  };

  const auto &paths = api["paths"];
  require(paths.isObject(), "OpenAPI paths must be an object");
  std::set<std::string> operationIds;
  for (const auto &[path, method] : expectedOperations) {
    require(paths.isMember(path), "OpenAPI is missing path " + path);
    require(paths[path].isMember(method),
            "OpenAPI is missing " + method + " " + path);
    const auto &operation = paths[path][method];
    require(operation["responses"].isObject() &&
                !operation["responses"].empty(),
            method + " " + path + " must declare responses");
    const auto operationId = operation["operationId"].asString();
    require(!operationId.empty(), method + " " + path + " needs operationId");
    require(operationIds.insert(operationId).second,
            "Duplicate operationId " + operationId);
  }
  require(operationIds.size() == expectedOperations.size(),
          "Unexpected operationId count");
  require(!paths.isMember("/api/protocol/command") &&
              !paths.isMember("/api/protocol/status"),
          "Removed ROC protocol endpoints must not return to OpenAPI");

  const auto &registerRequest = api["components"]["schemas"]["RegisterRequest"];
  require(arrayContains(registerRequest["required"], "invitation_code"),
          "Registration must require an invitation code");
  const auto &invitationRules =
      registerRequest["properties"]["invitation_code"]["allOf"];
  require(invitationRules.isArray() && invitationRules.size() == 3,
          "Invitation code contract must require length, letters and digits");
  require(invitationRules[0]["pattern"].asString() == "^[A-Za-z0-9]{5}$",
          "Invitation code contract must remain five alphanumeric characters");

  const auto &artifact =
      paths["/api/device/tasks/{taskId}/artifact"]["get"];
  require(artifact["responses"].isMember("416"),
          "Full-download-only artifact policy must document HTTP 416");
  require(artifact["security"].isArray() &&
              artifact["security"][0].isMember("deviceBearer"),
          "Device artifact download must use Device token security");
}

}  // namespace

int main() {
  try {
    validateJsonSchemas();
    validateOpenApi();
    std::cout << "API and JSON Schema contracts validated\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
