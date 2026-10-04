#include "protocols/DeploymentTaskProtocol.h"

#include <algorithm>
#include <cctype>
#include <initializer_list>
#include <stdexcept>

#include "utils/InputValidation.h"

namespace roc::protocol {
namespace {

void setError(TaskStatusProtocolError *error,
              const std::string &code,
              const std::string &message) {
  if (!error) return;
  error->code = code;
  error->message = message;
}

bool hasOnlyMembers(const Json::Value &object,
                    std::initializer_list<const char *> allowed) {
  for (const auto &name : object.getMemberNames()) {
    bool known = false;
    for (const auto *candidate : allowed) {
      if (name == candidate) {
        known = true;
        break;
      }
    }
    if (!known) return false;
  }
  return true;
}

bool validState(const std::string &state) {
  return state == "downloading" || state == "delivering" ||
         state == "delivered" || state == "failed";
}

const std::vector<DeviceTaskErrorContract> kDeviceTaskErrors{
    {"invalid_id", 400},
    {"invalid_json", 400},
    {"unknown_field", 400},
    {"invalid_status_state", 400},
    {"invalid_progress", 400},
    {"invalid_error_code", 400},
    {"invalid_error_message", 400},
    {"error_code_required", 400},
    {"authentication_failed", 401},
    {"invalid_lease", 401},
    {"task_not_found", 404},
    {"artifact_not_found", 404},
    {"invalid_state", 409},
    {"lease_expired", 409},
    {"lease_conflict", 409},
    {"attempts_exhausted", 409},
    {"event_conflict", 409},
    {"invalid_transition", 409},
    {"file_id_required", 409},
    {"range_not_supported", 416},
    {"internal_error", 500},
};

}  // namespace

std::optional<TaskStatusRequest> parseTaskStatusRequest(
    const Json::Value &body,
    TaskStatusProtocolError *error) {
  if (!body.isObject()) {
    setError(error, "invalid_json", "JSON object is required");
    return std::nullopt;
  }
  if (!hasOnlyMembers(body, {"event_id", "state", "progress",
                             "error_code", "error_message"})) {
    setError(error, "unknown_field",
             "Status request contains an unknown field");
    return std::nullopt;
  }

  if (!body["event_id"].isString() ||
      !roc::utils::isUuid(body["event_id"].asString())) {
    setError(error, "invalid_id", "event_id must be a UUID");
    return std::nullopt;
  }
  if (!body["state"].isString() ||
      !validState(body["state"].asString())) {
    setError(error, "invalid_status_state",
             "state must be downloading, delivering, delivered, or failed");
    return std::nullopt;
  }
  if (!body["progress"].isInt() || body["progress"].asInt() < 0 ||
      body["progress"].asInt() > 100) {
    setError(error, "invalid_progress",
             "progress must be an integer between 0 and 100");
    return std::nullopt;
  }
  if (body.isMember("error_code") &&
      (!body["error_code"].isString() ||
       body["error_code"].asString().size() > 64)) {
    setError(error, "invalid_error_code",
             "error_code must be a string of at most 64 characters");
    return std::nullopt;
  }
  if (body.isMember("error_message") &&
      (!body["error_message"].isString() ||
       body["error_message"].asString().size() > 512)) {
    setError(error, "invalid_error_message",
             "error_message must be a string of at most 512 characters");
    return std::nullopt;
  }

  TaskStatusRequest request;
  request.eventId = body["event_id"].asString();
  request.state = body["state"].asString();
  request.progress = body["progress"].asInt();
  request.errorCode = body.get("error_code", "").asString();
  request.errorMessage = body.get("error_message", "").asString();

  if (request.state == "delivered" && request.progress != 100) {
    setError(error, "invalid_progress",
             "delivered status must report progress 100");
    return std::nullopt;
  }
  if (request.state == "failed" && request.errorCode.empty()) {
    setError(error, "error_code_required",
             "failed status must provide a non-empty error_code");
    return std::nullopt;
  }
  return request;
}

Json::Value canonicalTaskStatusRequest(const TaskStatusRequest &request) {
  Json::Value body;
  auto eventId = request.eventId;
  std::transform(eventId.begin(), eventId.end(), eventId.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  body["event_id"] = eventId;
  body["state"] = request.state;
  body["progress"] = request.progress;
  if (!request.errorCode.empty()) body["error_code"] = request.errorCode;
  if (!request.errorMessage.empty()) body["error_message"] = request.errorMessage;
  return body;
}

std::string canonicalTaskStatusRequestJson(const TaskStatusRequest &request) {
  Json::StreamWriterBuilder writer;
  writer["indentation"] = "";
  writer["commentStyle"] = "None";
  writer["emitUTF8"] = true;
  return Json::writeString(writer, canonicalTaskStatusRequest(request));
}

bool taskStatusTransitionAllowed(const std::string &currentState,
                                 const std::string &requestedState) {
  if (currentState == "accepted") {
    return requestedState == "downloading" || requestedState == "failed";
  }
  if (currentState == "downloading") {
    return requestedState == "downloading" ||
           requestedState == "delivering" || requestedState == "failed";
  }
  if (currentState == "delivering") {
    return requestedState == "delivering" ||
           requestedState == "delivered" || requestedState == "failed";
  }
  return false;
}

bool taskProgressAllowed(int currentProgress, int requestedProgress) {
  return currentProgress >= 0 && currentProgress <= 100 &&
         requestedProgress >= currentProgress && requestedProgress <= 100;
}

bool expiredLeaseCanRetry(const std::string &currentState,
                          int attempt, int maxAttempts) {
  return (currentState == "accepted" || currentState == "downloading") &&
         attempt >= 0 && attempt < maxAttempts;
}

const std::vector<DeviceTaskErrorContract> &deviceTaskErrorContracts() {
  return kDeviceTaskErrors;
}

std::optional<int> deviceTaskErrorHttpStatus(const std::string &code) {
  for (const auto &contract : kDeviceTaskErrors) {
    if (contract.code == code) return contract.httpStatus;
  }
  return std::nullopt;
}

Json::Value makeDeviceTaskError(int httpStatus,
                                const std::string &code,
                                const std::string &message) {
  const auto expected = deviceTaskErrorHttpStatus(code);
  if (!expected || *expected != httpStatus) {
    throw std::invalid_argument(
        "Device task error code is not registered for this HTTP status");
  }
  Json::Value body;
  body["ok"] = false;
  body["code"] = code;
  body["message"] = message;
  return body;
}

}  // namespace roc::protocol
