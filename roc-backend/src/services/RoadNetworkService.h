#pragma once

#include <json/json.h>

#include <string>

namespace roc::service {

struct RoadNetworkValidation {
  bool ok{false};
  std::string code;
  std::string message;
  Json::Value normalized;
  std::string canonicalJson;
};

RoadNetworkValidation validateRoadNetwork(const Json::Value &network,
                                           const std::string &coordinateMode);

}  // namespace roc::service
