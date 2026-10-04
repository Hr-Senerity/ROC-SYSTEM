#include "services/RoadNetworkService.h"

#include <cassert>
#include <iostream>
#include <limits>
#include <set>

#ifdef NDEBUG
#error Contract tests require active assertions
#endif

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

Json::Value validCurvedNetwork() {
  auto network = validNetwork();
  network["schema_version"] = 2;
  network["sampling"]["algorithm"] = "uniform-parameter-v1";
  network["sampling"]["spacing"] = 0.25;
  network["sampling"]["precision"] = 6;
  network["edges"][0]["geometry"]["type"] = "cubic_bezier";
  network["edges"][0]["geometry"]["control1"]["x"] = 1.25;
  network["edges"][0]["geometry"]["control1"]["y"] = 2.5;
  network["edges"][0]["geometry"]["control2"]["x"] = 1.75;
  network["edges"][0]["geometry"]["control2"]["y"] = 3.5;
  return network;
}

}  // namespace

int main() {
  auto result = roc::service::validateRoadNetwork(validNetwork(), "metric");
  assert(result.ok);
  assert(result.normalized["nodes"][0]["id"].asString() == "node-a");
  assert(!result.canonicalJson.empty());

  auto spacingPrecision = validCurvedNetwork();
  spacingPrecision["sampling"]["spacing"] = 0.25000004;
  const auto precise = roc::service::validateRoadNetwork(spacingPrecision, "metric");
  assert(precise.ok);
  const auto reread = roc::service::validateRoadNetwork(precise.normalized, "metric");
  assert(reread.ok && precise.canonicalJson == reread.canonicalJson);

  auto underflowSpacing = validCurvedNetwork();
  underflowSpacing["sampling"]["spacing"] = 0.0000001;
  result = roc::service::validateRoadNetwork(underflowSpacing, "metric");
  assert(!result.ok && result.code == "invalid_sampling");

  auto extremeDistance = validCurvedNetwork();
  extremeDistance["nodes"][0]["x"] = std::numeric_limits<double>::max();
  result = roc::service::validateRoadNetwork(extremeDistance, "metric");
  assert(!result.ok && result.code == "too_many_samples");

  auto wrongType = validCurvedNetwork();
  wrongType["sampling"]["algorithm"] = Json::arrayValue;
  result = roc::service::validateRoadNetwork(wrongType, "metric");
  assert(!result.ok && result.code == "invalid_sampling");
  wrongType = validCurvedNetwork();
  wrongType["nodes"][0]["kind"] = Json::arrayValue;
  result = roc::service::validateRoadNetwork(wrongType, "metric");
  assert(!result.ok && result.code == "invalid_node");
  wrongType = validCurvedNetwork();
  wrongType["edges"][0]["direction"] = Json::arrayValue;
  result = roc::service::validateRoadNetwork(wrongType, "metric");
  assert(!result.ok && result.code == "invalid_edge");

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

  auto duplicateNode = validNetwork();
  duplicateNode["nodes"].append(duplicateNode["nodes"][0]);
  result = roc::service::validateRoadNetwork(duplicateNode, "metric");
  assert(!result.ok && result.code == "duplicate_node");

  auto duplicateEdgeId = validNetwork();
  auto oppositeForward = duplicateEdgeId["edges"][0];
  duplicateEdgeId["edges"][0]["direction"] = "forward";
  oppositeForward["from"] = "node-b";
  oppositeForward["to"] = "node-a";
  oppositeForward["direction"] = "forward";
  duplicateEdgeId["edges"].append(oppositeForward);
  result = roc::service::validateRoadNetwork(duplicateEdgeId, "metric");
  assert(!result.ok && result.code == "duplicate_edge");
  duplicateEdgeId["edges"][1]["id"] = "edge-b";
  result = roc::service::validateRoadNetwork(duplicateEdgeId, "metric");
  assert(result.ok);

  auto overlappingDirections = validNetwork();
  auto forward = overlappingDirections["edges"][0];
  forward["id"] = "edge-b";
  forward["direction"] = "forward";
  overlappingDirections["edges"].append(forward);
  result = roc::service::validateRoadNetwork(overlappingDirections, "metric");
  assert(!result.ok && result.code == "duplicate_edge");

  auto selfLoop = validNetwork();
  selfLoop["edges"][0]["to"] = "node-a";
  result = roc::service::validateRoadNetwork(selfLoop, "metric");
  assert(!result.ok);
  assert(result.code == "self_loop");

  const auto curved = validCurvedNetwork();
  const auto first = roc::service::validateRoadNetwork(curved, "metric");
  const auto second = roc::service::validateRoadNetwork(curved, "metric");
  assert(first.ok && second.ok);
  assert(first.canonicalJson == second.canonicalJson);
  assert(first.normalized["schema_version"].asInt() == 2);
  assert(first.normalized["trajectories"].size() == 2);
  assert(first.normalized["trajectories"][0]["points"].size() >= 2);
  assert(first.normalized["trajectories"][0]["points"][0]["x"].asDouble() == 1.0);
  assert(first.normalized["trajectories"][1]["points"][0]["x"].asDouble() == 2.0);
  std::set<std::string> trajectoryIds;
  for (const auto &trajectory : first.normalized["trajectories"]) {
    assert(trajectoryIds.insert(trajectory["id"].asString()).second);
    const auto &points = trajectory["points"];
    assert(points.size() >= 2);
    assert(points[0]["s"].asDouble() == 0.0);
    for (Json::ArrayIndex index = 0; index < points.size(); ++index) {
      assert(points[index]["index"].asUInt() == index);
      if (index > 0) {
        assert(points[index]["s"].asDouble() >=
               points[index - 1]["s"].asDouble());
      }
    }
    assert(trajectory["length"].asDouble() ==
           points[points.size() - 1]["s"].asDouble());
  }
  assert(first.normalized["trajectories"][0]["points"][0]["x"].asDouble() ==
         first.normalized["nodes"][0]["x"].asDouble());
  assert(first.normalized["trajectories"][0]["points"][
             first.normalized["trajectories"][0]["points"].size() - 1]["x"]
             .asDouble() == first.normalized["nodes"][1]["x"].asDouble());
  const auto csv = roc::service::roadNetworkTrajectoryCsv(first.normalized);
  assert(csv.find("trajectory_id,edge_id,direction,point_index") == 0);
  assert(csv.find("edge-a:forward") != std::string::npos);
  assert(csv.find("edge-a:reverse") != std::string::npos);

  auto invalidGeometry = validCurvedNetwork();
  invalidGeometry["edges"][0]["geometry"]["control1"]["x"] = "nan";
  result = roc::service::validateRoadNetwork(invalidGeometry, "metric");
  assert(!result.ok && result.code == "invalid_geometry");

  auto suppliedTrajectories = validCurvedNetwork();
  suppliedTrajectories["trajectories"] = Json::arrayValue;
  Json::Value forged;
  forged["id"] = "forged";
  suppliedTrajectories["trajectories"].append(forged);
  result = roc::service::validateRoadNetwork(suppliedTrajectories, "metric");
  assert(result.ok);
  assert(result.normalized["trajectories"][0]["id"].asString() ==
         "edge-a:forward");

  Json::Value empty;
  empty["schema_version"] = 1;
  empty["coordinate_mode"] = "legacy-normalized";
  empty["nodes"] = Json::arrayValue;
  empty["edges"] = Json::arrayValue;
  result = roc::service::validateRoadNetwork(empty, "legacy-normalized");
  assert(result.ok);

  auto offCanvasLegacy = validNetwork();
  offCanvasLegacy["coordinate_mode"] = "legacy-normalized";
  offCanvasLegacy["nodes"][0]["x"] = 125.0;
  result = roc::service::validateRoadNetwork(offCanvasLegacy,
                                             "legacy-normalized");
  assert(result.ok);

  std::cout << "RoadNetworkTests passed\n";
  return 0;
}
