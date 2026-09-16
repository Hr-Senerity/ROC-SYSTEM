#pragma once

#include <json/json.h>
#include <optional>
#include <string>
#include <vector>

namespace roc::service {

struct DeviceIdentity {
  std::string vehicleId;
  std::string projectId;
  std::string mapId;
};

struct DeploymentResult {
  int status{200};
  Json::Value body;
  bool ok() const { return status >= 200 && status < 300; }
};

class DeploymentService {
 public:
  DeploymentService(std::string connStr, std::string jwtSecret);

  std::optional<DeviceIdentity> authenticateDevice(
      const std::string &deviceToken) const;

  DeploymentResult createBatch(
      const std::string &projectId, const std::string &userId,
      const std::string &role, const std::string &resourceType,
      const std::string &resourceRevisionId,
      const std::vector<std::string> &vehicleIds,
      const std::string &idempotencyKey) const;

  DeploymentResult getBatch(const std::string &projectId,
                            const std::string &batchId,
                            const std::string &userId,
                            const std::string &role) const;

  DeploymentResult cancelBatch(const std::string &projectId,
                               const std::string &batchId,
                               const std::string &userId,
                               const std::string &role) const;

  std::vector<Json::Value> offerPendingTasks(
      const std::string &vehicleId) const;

  DeploymentResult acceptTask(const DeviceIdentity &device,
                              const std::string &taskId) const;

  DeploymentResult getManifest(const DeviceIdentity &device,
                               const std::string &taskId,
                               const std::string &leaseToken) const;

  DeploymentResult getArtifact(const DeviceIdentity &device,
                               const std::string &taskId,
                               const std::string &leaseToken) const;

  DeploymentResult updateTaskStatus(const DeviceIdentity &device,
                                    const std::string &taskId,
                                    const std::string &leaseToken,
                                    const std::string &eventId,
                                    const std::string &state,
                                    int progress,
                                    const std::string &errorCode,
                                    const std::string &errorMessage) const;

 private:
  std::string connStr_;
  std::string jwtSecret_;
};

}  // namespace roc::service