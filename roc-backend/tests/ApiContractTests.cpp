#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
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

std::set<std::string> stringSet(const Json::Value &array) {
  std::set<std::string> values;
  require(array.isArray(), "Expected a JSON array of strings");
  for (const auto &item : array) {
    require(item.isString(), "Expected a JSON string array item");
    values.insert(item.asString());
  }
  return values;
}

std::set<std::string> memberNameSet(const Json::Value &object) {
  require(object.isObject(), "Expected a JSON object");
  const auto names = object.getMemberNames();
  return std::set<std::string>(names.begin(), names.end());
}

bool matches(const std::string &pattern, const std::string &value) {
  return std::regex_match(value, std::regex(pattern));
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
  const auto &clientSequence = device["$defs"]["positiveInt64String"];
  require(clientSequence["type"].asString() == "string" &&
              clientSequence["maxLength"].asInt() == 19,
          "Device sequence must be a canonical decimal string of at most 19 digits");
  const auto sequencePattern = clientSequence["pattern"].asString();
  require(matches(sequencePattern, "1") &&
              matches(sequencePattern, "9223372036854775807") &&
              !matches(sequencePattern, "0") &&
              !matches(sequencePattern, "01") &&
              !matches(sequencePattern, "9223372036854775808") &&
              !matches(sequencePattern, "18446744073709551615"),
          "Device sequence schema must encode the exact positive INT64 range");
  const auto &serverEnvelope = device["$defs"]["serverMessageEnvelope"];
  require(serverEnvelope["additionalProperties"].isBool() &&
              !serverEnvelope["additionalProperties"].asBool(),
          "Server WebSocket envelope must reject unknown top-level properties");
  for (const auto *definition : {"hello", "ack", "error"}) {
    require(device["$defs"].isMember(definition),
            std::string("Device protocol is missing downstream ") + definition);
    const auto &payload =
        device["$defs"][definition]["allOf"][1]["properties"]["payload"];
    require(payload["additionalProperties"].isBool() &&
                payload["additionalProperties"].asBool(),
            std::string("Downstream ") + definition +
                " payload must permit additive extension fields");
  }
  const auto &helloPayload =
      device["$defs"]["hello"]["allOf"][1]["properties"]["payload"];
  for (const auto *field : {
           "vehicle_id", "heartbeat_interval_seconds", "idle_timeout_seconds",
           "max_message_bytes", "max_heartbeat_bytes", "max_telemetry_bytes",
           "last_client_sequence"}) {
    require(arrayContains(helloPayload["required"], field),
            std::string("hello payload must require ") + field);
  }
  const auto &ackPayload =
      device["$defs"]["ack"]["allOf"][1]["properties"]["payload"];
  for (const auto *field : {
           "ack_message_id", "ack_sequence", "accepted_type", "duplicate"}) {
    require(arrayContains(ackPayload["required"], field),
            std::string("ack payload must require ") + field);
  }
  const auto &wsErrorPayload =
      device["$defs"]["error"]["allOf"][1]["properties"]["payload"];
  require(arrayContains(wsErrorPayload["required"], "code") &&
              arrayContains(wsErrorPayload["required"], "message") &&
              wsErrorPayload["properties"].isMember("request_message_id"),
          "WebSocket error payload must freeze code, message and request correlation");

  const auto road = readJson("road-network-v1.schema.json");
  require(road["properties"]["schema_version"]["const"].asInt() == 1,
          "Road-network schema version must remain 1");
  require(road["$defs"].isMember("node") && road["$defs"].isMember("edge"),
          "Road-network schema must define nodes and edges");
  const auto &roadRules = road["x-roc-semantic-rules"];
  require(roadRules["node_ids"].asString() == "unique" &&
              roadRules["edge_ids"].asString() == "unique" &&
              roadRules["edge_endpoints"].asString() ==
                  "must reference existing nodes" &&
              roadRules["self_loops"].asString() == "forbidden" &&
              roadRules["empty_network"].asString() == "allowed",
          "Road-network v1 must expose its machine-readable semantic rules");
  require(road["properties"]["nodes"]["maxItems"].asInt() == 10000 &&
              road["properties"]["edges"]["maxItems"].asInt() == 50000 &&
              road["$defs"]["edge"]["properties"]["max_speed_mps"]
                      ["maximum"].asInt() == 100,
          "Road-network v1 schema limits must match runtime validation");
  const auto roadV2 = readJson("road-network-v2.schema.json");
  require(roadV2["properties"]["schema_version"]["const"].asInt() == 2,
          "Road-network v2 schema version must be 2");
  require(roadV2["$defs"].isMember("geometry") &&
              roadV2["$defs"].isMember("trajectory"),
          "Road-network v2 must define curve geometry and deterministic trajectories");
  const auto &roadV2Rules = roadV2["x-roc-semantic-rules"];
  require(roadV2Rules["inherits"].asString() == "road-network-v1" &&
              roadV2Rules["trajectories"].asString().find(
                  "SYSTEM regenerates") == 0 &&
              roadV2Rules["input_trajectories"].asString() ==
                  "not authoritative and replaced during normalization",
          "Road-network v2 must freeze authoritative trajectory semantics");

  const auto deployment = readJson("deployment-task-v1.schema.json");
  for (const auto *definition : {
           "taskAvailable", "statusRequest", "task", "acceptResponse",
           "statusResponse", "manifestResponse", "deviceErrorResponse",
           "deviceBadRequestError", "deviceUnauthorizedError",
           "deviceNotFoundError", "deviceConflictError", "deviceRangeError",
           "deviceServerError"}) {
    require(deployment["$defs"].isMember(definition),
            std::string("Deployment schema is missing ") + definition);
  }
  require(deployment["$defs"]["positiveInt64String"]["pattern"].asString() ==
              sequencePattern,
          "Client and server sequence envelopes must share the same INT64 range");
  require(deployment["$defs"]["taskAvailable"]["properties"]["payload"]
                  ["additionalProperties"].asBool(),
          "task.available payload must permit additive extension fields");
  const auto &stateMachine = deployment["x-roc-state-machine"];
  for (const auto *rule : {
           "attempt", "progress", "expired_lease", "event_replay",
           "normalization"}) {
    require(stateMachine[rule].isString() &&
                !stateMachine[rule].asString().empty(),
            std::string("Deployment state machine must define ") + rule);
  }
  for (const auto *field :
       {"ok", "replayed", "lease_token", "lease_expires_at", "task"}) {
    require(arrayContains(deployment["$defs"]["acceptResponse"]["required"],
                          field),
            std::string("Accept response must require ") + field);
  }
  for (const auto *field : {"ok", "replayed", "project_id", "task"}) {
    require(arrayContains(deployment["$defs"]["statusResponse"]["required"],
                          field),
            std::string("Status response must require ") + field);
  }
  require(stringSet(deployment["$defs"]["deviceBadRequestError"]["allOf"][1]
                              ["properties"]["code"]["enum"]) ==
              std::set<std::string>{
                  "error_code_required", "invalid_error_code",
                  "invalid_error_message", "invalid_id", "invalid_json",
                  "invalid_progress", "invalid_status_state", "unknown_field"},
          "HTTP 400 device error codes must remain frozen");
  require(stringSet(deployment["$defs"]["deviceUnauthorizedError"]["allOf"][1]
                              ["properties"]["code"]["enum"]) ==
              std::set<std::string>{"authentication_failed", "invalid_lease"},
          "HTTP 401 device error codes must remain frozen");
  require(stringSet(deployment["$defs"]["deviceNotFoundError"]["allOf"][1]
                              ["properties"]["code"]["enum"]) ==
              std::set<std::string>{"artifact_not_found", "task_not_found"},
          "HTTP 404 device error codes must remain frozen");
  require(stringSet(deployment["$defs"]["deviceConflictError"]["allOf"][1]
                              ["properties"]["code"]["enum"]) ==
              std::set<std::string>{
                  "attempts_exhausted", "event_conflict", "file_id_required",
                  "invalid_state", "invalid_transition", "lease_conflict",
                  "lease_expired"},
          "HTTP 409 device error codes must remain frozen");
  require(deployment["$defs"]["deviceRangeError"]["allOf"][1]
                         ["properties"]["code"]["const"].asString() ==
              "range_not_supported" &&
              deployment["$defs"]["deviceServerError"]["allOf"][1]
                         ["properties"]["code"]["const"].asString() ==
                  "internal_error",
          "HTTP 416 and 500 device error codes must remain frozen");
  const auto &statusConditions =
      deployment["$defs"]["statusRequest"]["allOf"];
  require(statusConditions.isArray() && statusConditions.size() == 2,
          "Status request must encode delivered and failed conditions");
  require(statusConditions[0]["if"]["properties"]["state"]["const"].asString() ==
              "delivered" &&
              statusConditions[0]["then"]["properties"]["progress"]["const"].asInt() == 100,
          "Delivered status must require progress 100");
  require(statusConditions[1]["if"]["properties"]["state"]["const"].asString() ==
              "failed" &&
              arrayContains(statusConditions[1]["then"]["required"], "error_code") &&
              statusConditions[1]["then"]["properties"]["error_code"]["minLength"].asInt() == 1,
          "Failed status must require a non-empty error_code");
}

void validateOpenApi() {
  const auto api = readJson("openapi-v1.json");
  require(api["openapi"].asString() == "3.1.0",
          "OpenAPI version must be 3.1.0");
  require(api["components"]["securitySchemes"].isMember("accountBearer"),
          "OpenAPI is missing accountBearer");
  const auto &deviceAuthorization =
      api["components"]["securitySchemes"]["deviceAuthorization"];
  require(deviceAuthorization["type"].asString() == "apiKey" &&
              deviceAuthorization["in"].asString() == "header" &&
              deviceAuthorization["name"].asString() == "Authorization",
          "OpenAPI must model Device authentication as the explicit Authorization header");
  require(deviceAuthorization["description"].asString().find("Device <DEVICE_TOKEN>") !=
              std::string::npos,
          "OpenAPI must document the exact Device token prefix");

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
      {"/api/projects/{projectId}/maps/{mapId}/road-network/revisions/{revisionId}/export/editor.json", "get"},
      {"/api/projects/{projectId}/maps/{mapId}/road-network/revisions/{revisionId}/export/trajectory.csv", "get"},
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
      {"/api/device/tasks/{taskId}/artifact/{fileId}", "get"},
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

  struct DeviceOperationContract {
    std::string path;
    std::string method;
    std::set<std::string> statuses;
    std::string successSchema;
  };
  const std::vector<DeviceOperationContract> deviceOperations{
      {"/api/device/tasks/{taskId}/accept", "post",
       {"200", "400", "401", "404", "409", "500"},
       "./deployment-task-v1.schema.json#/$defs/acceptResponse"},
      {"/api/device/tasks/{taskId}/manifest", "get",
       {"200", "400", "401", "404", "409", "500"},
       "./deployment-task-v1.schema.json#/$defs/manifestResponse"},
      {"/api/device/tasks/{taskId}/artifact", "get",
       {"200", "400", "401", "404", "409", "416", "500"}, ""},
      {"/api/device/tasks/{taskId}/artifact/{fileId}", "get",
       {"200", "400", "401", "404", "409", "416", "500"}, ""},
      {"/api/device/tasks/{taskId}/status", "post",
       {"200", "400", "401", "404", "409", "500"},
       "./deployment-task-v1.schema.json#/$defs/statusResponse"},
  };
  const std::vector<std::pair<std::string, std::string>> deviceErrorResponses{
      {"400", "#/components/responses/DeviceBadRequest"},
      {"401", "#/components/responses/DeviceUnauthorized"},
      {"404", "#/components/responses/DeviceNotFound"},
      {"409", "#/components/responses/DeviceConflict"},
      {"416", "#/components/responses/DeviceRangeError"},
      {"500", "#/components/responses/DeviceServerError"},
  };
  for (const auto &contract : deviceOperations) {
    const auto &operation = paths[contract.path][contract.method];
    const auto &responses = operation["responses"];
    require(memberNameSet(responses) == contract.statuses,
            contract.method + " " + contract.path +
                " must expose the frozen HTTP status set");
    require(!responses.isMember("403"),
            contract.method + " " + contract.path +
                " must not advertise an unused HTTP 403 response");
    if (!contract.successSchema.empty()) {
      require(responses["200"]["content"]["application/json"]["schema"]["$ref"]
                      .asString() == contract.successSchema,
              contract.method + " " + contract.path +
                  " must use its dedicated success schema");
    }
    for (const auto &[status, responseRef] : deviceErrorResponses) {
      if (!responses.isMember(status)) continue;
      require(responses[status]["$ref"].asString() == responseRef,
              contract.method + " " + contract.path + " HTTP " + status +
                  " must use its dedicated device error response");
    }
  }
  for (const auto *component : {
           "DeviceBadRequest", "DeviceUnauthorized", "DeviceNotFound",
           "DeviceConflict", "DeviceRangeError", "DeviceServerError"}) {
    require(api["components"]["responses"].isMember(component),
            std::string("OpenAPI is missing ") + component);
  }

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
              artifact["security"][0].isMember("deviceAuthorization"),
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
