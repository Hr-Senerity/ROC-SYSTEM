#include "services/RoadNetworkService.h"

#include <cassert>
#include <iostream>

namespace {

Json::Value validNetwork() {
  Json::Value network;
  network["schema_version"] = 1;
  network["coordinate_mode"] = "metric";
  network["nodes"] = Json::arrayValue;
  network["edges"] = Json::arrayValue;

  Json::Value second;
  second["id"] = "node-b";
  second["x"] = 2.0;
  second["y"] = 3.0;
  second["kind"] = "waypoint";
  second["label"] = "B";
  network["nodes"].append(second);

  Json::Value first;
  first["id"] = "node-a";
  first["x"] = 1.0;
  first["y"] = 1.5;
  first["kind"] = "waypoint";
  first["label"] = "A";
  network["nodes"].append(first);

  Json::Value edge;
  edge["id"] = "edge-a";
  edge["from"] = "node-a";
  edge["to"] = "node-b";
  edge["direction"] = "both";
  edge["max_speed_mps"] = 2.5;
  network["edges"].append(edge);
  return network;
}

}  // namespace

int main() {
  auto result = roc::service::validateRoadNetwork(validNetwork(), "metric");
  assert(result.ok);
  assert(result.normalized["nodes"][0]["id"].asString() == "node-a");
  assert(!result.canonicalJson.empty());

  auto mismatch = roc::service::validateRoadNetwork(
      validNetwork(), "legacy-normalized");
  assert(!mismatch.ok);
  assert(mismatch.code == "coordinate_mode_mismatch");

  auto dangling = validNetwork();
  dangling["edges"][0]["to"] = "missing";
  result = roc::service::validateRoadNetwork(dangling, "metric");
  assert(!result.ok);
  assert(result.code == "dangling_edge");

  auto duplicate = validNetwork();
  auto reverse = duplicate["edges"][0];
  reverse["id"] = "edge-b";
  reverse["from"] = "node-b";
  reverse["to"] = "node-a";
  duplicate["edges"].append(reverse);
  result = roc::service::validateRoadNetwork(duplicate, "metric");
  assert(!result.ok);
  assert(result.code == "duplicate_edge");

  auto selfLoop = validNetwork();
  selfLoop["edges"][0]["to"] = "node-a";
  result = roc::service::validateRoadNetwork(selfLoop, "metric");
  assert(!result.ok);
  assert(result.code == "self_loop");

  std::cout << "RoadNetworkTests passed\n";
  return 0;
}
