#pragma once

#include <optional>
#include <string>
#include <vector>

#include <json/json.h>

namespace roc::protocol {

struct TaskStatusRequest {
  std::string eventId;
  std::string state;
  int progress{0};
  std::string errorCode;
  std::string errorMessage;
};

struct TaskStatusProtocolError {
  std::string code;
  std::string message;
};

struct DeviceTaskErrorContract {
  std::string code;
  int httpStatus{500};
};

std::optional<TaskStatusRequest> parseTaskStatusRequest(
    const Json::Value &body,
    TaskStatusProtocolError *error = nullptr);

Json::Value canonicalTaskStatusRequest(const TaskStatusRequest &request);

std::string canonicalTaskStatusRequestJson(const TaskStatusRequest &request);

bool taskStatusTransitionAllowed(const std::string &currentState,
                                 const std::string &requestedState);

bool taskProgressAllowed(int currentProgress, int requestedProgress);

bool expiredLeaseCanRetry(const std::string &currentState,
                          int attempt, int maxAttempts);

const std::vector<DeviceTaskErrorContract> &deviceTaskErrorContracts();

std::optional<int> deviceTaskErrorHttpStatus(const std::string &code);

Json::Value makeDeviceTaskError(int httpStatus,
                                const std::string &code,
                                const std::string &message);

}  // namespace roc::protocol
