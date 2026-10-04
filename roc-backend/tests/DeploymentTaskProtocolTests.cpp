#include "protocols/DeploymentTaskProtocol.h"

#include <cassert>
#include <iostream>
#include <map>
#include <stdexcept>

#ifdef NDEBUG
#error Contract tests require active assertions
#endif

namespace {

Json::Value status(const std::string &state, int progress) {
  Json::Value body;
  body["event_id"] = "123e4567-e89b-42d3-a456-426614174000";
  body["state"] = state;
  body["progress"] = progress;
  return body;
}

}  // namespace

int main() {
  roc::protocol::TaskStatusProtocolError error;

  auto body = status("downloading", 25);
  auto parsed = roc::protocol::parseTaskStatusRequest(body, &error);
  assert(parsed && parsed->state == "downloading" && parsed->progress == 25);

  body = status("delivered", 100);
  parsed = roc::protocol::parseTaskStatusRequest(body, &error);
  assert(parsed && parsed->progress == 100);

  body = status("delivered", 99);
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "invalid_progress");

  body = status("failed", 40);
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "error_code_required");

  body["error_code"] = "download_hash_mismatch";
  body["error_message"] = "artifact digest does not match manifest";
  error = {};
  parsed = roc::protocol::parseTaskStatusRequest(body, &error);
  assert(parsed && parsed->errorCode == "download_hash_mismatch");
  const auto canonical = roc::protocol::canonicalTaskStatusRequestJson(*parsed);
  assert(canonical ==
         "{\"error_code\":\"download_hash_mismatch\","
         "\"error_message\":\"artifact digest does not match manifest\","
         "\"event_id\":\"123e4567-e89b-42d3-a456-426614174000\","
         "\"progress\":40,\"state\":\"failed\"}");

  auto equivalent = status("failed", 40);
  equivalent["error_code"] = "download_hash_mismatch";
  equivalent["error_message"] = "artifact digest does not match manifest";
  const auto equivalentParsed =
      roc::protocol::parseTaskStatusRequest(equivalent, &error);
  assert(equivalentParsed);
  assert(roc::protocol::canonicalTaskStatusRequestJson(*equivalentParsed) ==
         canonical);

  auto uppercaseEvent = *equivalentParsed;
  uppercaseEvent.eventId = "123E4567-E89B-42D3-A456-426614174000";
  assert(roc::protocol::canonicalTaskStatusRequestJson(uppercaseEvent) ==
         canonical);
  auto emptyErrors = *roc::protocol::parseTaskStatusRequest(
      status("downloading", 25), &error);
  const auto withoutErrors =
      roc::protocol::canonicalTaskStatusRequestJson(emptyErrors);
  auto explicitlyEmpty = status("downloading", 25);
  explicitlyEmpty["error_code"] = "";
  explicitlyEmpty["error_message"] = "";
  assert(roc::protocol::canonicalTaskStatusRequestJson(
             *roc::protocol::parseTaskStatusRequest(explicitlyEmpty, &error)) ==
         withoutErrors);

  body["extra"] = true;
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "unknown_field");

  body = status("unknown", 10);
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "invalid_status_state");

  body = status("downloading", 101);
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "invalid_progress");

  body = status("failed", 10);
  body["error_code"] = std::string(65, 'x');
  error = {};
  assert(!roc::protocol::parseTaskStatusRequest(body, &error));
  assert(error.code == "invalid_error_code");

  const auto &contracts = roc::protocol::deviceTaskErrorContracts();
  const std::map<std::string, int> expectedContracts{
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
  assert(contracts.size() == expectedContracts.size());
  for (const auto &contract : contracts) {
    const auto frozen = expectedContracts.find(contract.code);
    assert(frozen != expectedContracts.end());
    assert(frozen->second == contract.httpStatus);
    const auto expected =
        roc::protocol::deviceTaskErrorHttpStatus(contract.code);
    assert(expected && *expected == contract.httpStatus);
    const auto response = roc::protocol::makeDeviceTaskError(
        contract.httpStatus, contract.code, "contract test");
    assert(!response["ok"].asBool());
    assert(response["code"].asString() == contract.code);
    assert(response["message"].asString() == "contract test");
  }
  assert(!roc::protocol::deviceTaskErrorHttpStatus("unknown_code"));
  bool rejectedMismatch = false;
  try {
    (void)roc::protocol::makeDeviceTaskError(
        409, "authentication_failed", "wrong mapping");
  } catch (const std::invalid_argument &) {
    rejectedMismatch = true;
  }
  assert(rejectedMismatch);

  assert(roc::protocol::taskStatusTransitionAllowed("accepted",
                                                     "downloading"));
  assert(roc::protocol::taskStatusTransitionAllowed("accepted", "failed"));
  assert(!roc::protocol::taskStatusTransitionAllowed("accepted",
                                                      "delivered"));
  assert(roc::protocol::taskStatusTransitionAllowed("downloading",
                                                     "downloading"));
  assert(roc::protocol::taskStatusTransitionAllowed("downloading",
                                                     "delivering"));
  assert(roc::protocol::taskStatusTransitionAllowed("delivering",
                                                     "delivered"));
  assert(!roc::protocol::taskStatusTransitionAllowed("delivered",
                                                      "delivered"));

  assert(roc::protocol::taskProgressAllowed(40, 40));
  assert(roc::protocol::taskProgressAllowed(40, 100));
  assert(!roc::protocol::taskProgressAllowed(40, 39));
  assert(!roc::protocol::taskProgressAllowed(40, 101));

  assert(roc::protocol::expiredLeaseCanRetry("accepted", 1, 3));
  assert(roc::protocol::expiredLeaseCanRetry("downloading", 2, 3));
  assert(!roc::protocol::expiredLeaseCanRetry("delivering", 1, 3));
  assert(!roc::protocol::expiredLeaseCanRetry("accepted", 3, 3));

  std::cout << "DeploymentTaskProtocolTests passed\n";
  return 0;
}
