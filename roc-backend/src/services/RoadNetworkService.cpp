#include "services/RoadNetworkService.h"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace roc::service {
namespace {

constexpr Json::ArrayIndex kMaxNodes = 10000;
constexpr Json::ArrayIndex kMaxEdges = 50000;
constexpr std::size_t kMaxSamples = 200000;
constexpr std::size_t kMaxSamplesPerTrajectory = 10000;
constexpr double kMaxSpeedMps = 100.0;
constexpr std::size_t kMaxDocumentBytes = 10 * 1024 * 1024;
constexpr int kPrecision = 6;

struct Point { double x{0}; double y{0}; };

RoadNetworkValidation fail(const std::string &code, const std::string &message) {
  RoadNetworkValidation result;
  result.code = code;
  result.message = message;
  return result;
}

bool hasOnlyMembers(const Json::Value &value, const std::set<std::string> &allowed) {
  for (const auto &name : value.getMemberNames()) {
    if (allowed.count(name) == 0) return false;
  }
  return true;
}

bool validIdentifier(const std::string &value) {
  static const std::regex pattern("^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$");
  return std::regex_match(value, pattern);
}

bool finiteNumber(const Json::Value &value) {
  return value.isNumeric() && std::isfinite(value.asDouble());
}

double rounded(double value) {
  constexpr double scale = 1000000.0;
  const auto result = std::round(value * scale) / scale;
  return result == 0 ? 0 : result;
}

double distance(const Point &left, const Point &right) {
  return std::hypot(right.x - left.x, right.y - left.y);
}

Point cubic(const Point &p0, const Point &p1, const Point &p2,
            const Point &p3, double t) {
  const auto u = 1.0 - t;
  return {u * u * u * p0.x + 3 * u * u * t * p1.x +
              3 * u * t * t * p2.x + t * t * t * p3.x,
          u * u * u * p0.y + 3 * u * u * t * p1.y +
              3 * u * t * t * p2.y + t * t * t * p3.y};
}

std::string canonicalString(const Json::Value &value) {
  Json::StreamWriterBuilder writer;
  writer["indentation"] = "";
  writer["commentStyle"] = "None";
  writer["enableYAMLCompatibility"] = false;
  writer["dropNullPlaceholders"] = false;
  writer["emitUTF8"] = true;
  return Json::writeString(writer, value);
}

Json::Value makeTrajectory(const Json::Value &edge,
                           const std::vector<Point> &points,
                           const std::string &direction) {
  Json::Value trajectory;
  trajectory["id"] = edge["id"].asString() + ":" + direction;
  trajectory["edge_id"] = edge["id"].asString();
  trajectory["direction"] = direction;
  trajectory["max_speed_mps"] = edge["max_speed_mps"];
  trajectory["points"] = Json::arrayValue;
  double s = 0;
  for (std::size_t index = 0; index < points.size(); ++index) {
    if (index > 0) s += distance(points[index - 1], points[index]);
    Point delta;
    if (index + 1 < points.size()) {
      delta = {points[index + 1].x - points[index].x,
               points[index + 1].y - points[index].y};
    } else if (index > 0) {
      delta = {points[index].x - points[index - 1].x,
               points[index].y - points[index - 1].y};
    }
    Json::Value sample;
    sample["index"] = static_cast<Json::UInt64>(index);
    sample["x"] = rounded(points[index].x);
    sample["y"] = rounded(points[index].y);
    sample["s"] = rounded(s);
    sample["heading"] = rounded(std::hypot(delta.x, delta.y) > 1e-12
                                    ? std::atan2(delta.y, delta.x)
                                    : 0.0);
    trajectory["points"].append(sample);
  }
  trajectory["length"] = rounded(s);
  return trajectory;
}

std::vector<Point> sampleEdge(const Json::Value &edge, const Point &from,
                              const Point &to, double spacing) {
  const auto type = edge["geometry"]["type"].asString();
  Point control1 = from;
  Point control2 = to;
  double estimate = distance(from, to);
  if (type == "cubic_bezier") {
    control1 = {edge["geometry"]["control1"]["x"].asDouble(),
                edge["geometry"]["control1"]["y"].asDouble()};
    control2 = {edge["geometry"]["control2"]["x"].asDouble(),
                edge["geometry"]["control2"]["y"].asDouble()};
    estimate = distance(from, control1) + distance(control1, control2) +
               distance(control2, to);
  }
  const auto segments = std::max<std::size_t>(
      1, static_cast<std::size_t>(std::ceil(estimate / spacing)));
  if (segments + 1 > kMaxSamplesPerTrajectory) return {};
  std::vector<Point> points;
  points.reserve(segments + 1);
  for (std::size_t index = 0; index <= segments; ++index) {
    const auto t = static_cast<double>(index) / static_cast<double>(segments);
    points.push_back(type == "cubic_bezier"
                         ? cubic(from, control1, control2, to, t)
                         : Point{from.x + (to.x - from.x) * t,
                                 from.y + (to.y - from.y) * t});
  }
  points.front() = from;
  points.back() = to;
  return points;
}

}  // namespace

RoadNetworkValidation validateRoadNetwork(const Json::Value &network,
                                           const std::string &coordinateMode) {
  if (!network.isObject() || !network["schema_version"].isInt()) {
    return fail("invalid_network", "network must contain schema_version");
  }
  const auto schemaVersion = network["schema_version"].asInt();
  if (schemaVersion != 1 && schemaVersion != 2) {
    return fail("unsupported_schema", "schema_version must be 1 or 2");
  }
  const std::set<std::string> allowed = schemaVersion == 1
      ? std::set<std::string>{"schema_version", "coordinate_mode", "nodes", "edges"}
      : std::set<std::string>{"schema_version", "coordinate_mode", "sampling", "nodes", "edges", "trajectories"};
  if (!hasOnlyMembers(network, allowed)) {
    return fail("unknown_field", "network contains an unsupported field");
  }
  if (!network["coordinate_mode"].isString() ||
      (network["coordinate_mode"].asString() != "metric" &&
       network["coordinate_mode"].asString() != "legacy-normalized")) {
    return fail("invalid_coordinate_mode", "coordinate_mode must be metric or legacy-normalized");
  }
  if (network["coordinate_mode"].asString() != coordinateMode) {
    return fail("coordinate_mode_mismatch", "network coordinate_mode does not match the map");
  }
  if (!network["nodes"].isArray() || !network["edges"].isArray()) {
    return fail("invalid_network", "nodes and edges must be arrays");
  }
  if (network["nodes"].size() > kMaxNodes || network["edges"].size() > kMaxEdges) {
    return fail("network_too_large", "network exceeds the node or edge limit");
  }

  double spacing = coordinateMode == "metric" ? 0.25 : 0.01;
  if (schemaVersion == 2 && network.isMember("sampling")) {
    const auto &sampling = network["sampling"];
    if (!sampling.isObject() ||
        !hasOnlyMembers(sampling, {"algorithm", "spacing", "precision"}) ||
        sampling["algorithm"].asString() != "uniform-parameter-v1" ||
        !finiteNumber(sampling["spacing"]) || sampling["spacing"].asDouble() <= 0 ||
        sampling["spacing"].asDouble() > (coordinateMode == "metric" ? 100.0 : 1.0) ||
        !sampling["precision"].isInt() || sampling["precision"].asInt() != kPrecision) {
      return fail("invalid_sampling", "sampling requires uniform-parameter-v1, positive spacing, and precision 6");
    }
    spacing = sampling["spacing"].asDouble();
  }

  std::unordered_set<std::string> nodeIds;
  std::unordered_map<std::string, Point> positions;
  std::vector<Json::Value> nodes;
  for (Json::ArrayIndex index = 0; index < network["nodes"].size(); ++index) {
    const auto &node = network["nodes"][index];
    const auto prefix = "nodes[" + std::to_string(index) + "]";
    if (!node.isObject() || !hasOnlyMembers(node, {"id", "x", "y", "kind", "label"}) ||
        !node["id"].isString() || !validIdentifier(node["id"].asString()) ||
        !finiteNumber(node["x"]) || !finiteNumber(node["y"]) ||
        node["kind"].asString() != "waypoint" || !node["label"].isString() ||
        node["label"].asString().size() > 128) {
      return fail("invalid_node", prefix + " has an invalid shape");
    }
    const auto id = node["id"].asString();
    if (!nodeIds.insert(id).second) return fail("duplicate_node", "duplicate node id: " + id);
    Json::Value normalized;
    normalized["id"] = id;
    normalized["x"] = rounded(node["x"].asDouble());
    normalized["y"] = rounded(node["y"].asDouble());
    normalized["kind"] = "waypoint";
    normalized["label"] = node["label"].asString();
    positions[id] = {normalized["x"].asDouble(), normalized["y"].asDouble()};
    nodes.push_back(std::move(normalized));
  }

  std::unordered_set<std::string> edgeIds;
  std::unordered_set<std::string> edgeKeys;
  std::vector<Json::Value> edges;
  for (Json::ArrayIndex index = 0; index < network["edges"].size(); ++index) {
    const auto &edge = network["edges"][index];
    const auto prefix = "edges[" + std::to_string(index) + "]";
    const std::set<std::string> members = schemaVersion == 1
        ? std::set<std::string>{"id", "from", "to", "direction", "max_speed_mps"}
        : std::set<std::string>{"id", "from", "to", "direction", "max_speed_mps", "geometry"};
    if (!edge.isObject() || !hasOnlyMembers(edge, members) ||
        !edge["id"].isString() || !validIdentifier(edge["id"].asString()) ||
        !edge["from"].isString() || !edge["to"].isString()) {
      return fail("invalid_edge", prefix + " has an invalid shape");
    }
    const auto id = edge["id"].asString();
    const auto from = edge["from"].asString();
    const auto to = edge["to"].asString();
    if (!edgeIds.insert(id).second) return fail("duplicate_edge", "duplicate edge id: " + id);
    if (nodeIds.count(from) == 0 || nodeIds.count(to) == 0) return fail("dangling_edge", prefix + " references a missing node");
    if (from == to) return fail("self_loop", prefix + " cannot connect a node to itself");
    if (edge["direction"].asString() != "both" && edge["direction"].asString() != "forward") {
      return fail("invalid_edge", prefix + ".direction must be both or forward");
    }
    const auto direction = edge["direction"].asString();
    const auto key = direction == "both" ? direction + ":" + std::min(from, to) + ":" + std::max(from, to)
                                           : direction + ":" + from + ":" + to;
    if (!edgeKeys.insert(key).second) return fail("duplicate_edge", prefix + " duplicates an existing connection");
    if (edge.isMember("max_speed_mps") && !edge["max_speed_mps"].isNull() &&
        (!finiteNumber(edge["max_speed_mps"]) || edge["max_speed_mps"].asDouble() <= 0 ||
         edge["max_speed_mps"].asDouble() > kMaxSpeedMps)) {
      return fail("invalid_edge", prefix + ".max_speed_mps must be greater than 0 and at most 100");
    }
    Json::Value normalized;
    normalized["id"] = id;
    normalized["from"] = from;
    normalized["to"] = to;
    normalized["direction"] = direction;
    normalized["max_speed_mps"] = edge.isMember("max_speed_mps") && !edge["max_speed_mps"].isNull()
        ? Json::Value(edge["max_speed_mps"].asDouble()) : Json::Value(Json::nullValue);
    if (schemaVersion == 2) {
      const auto &geometry = edge["geometry"];
      if (!geometry.isObject() || !geometry["type"].isString() ||
          (geometry["type"].asString() != "line" && geometry["type"].asString() != "cubic_bezier")) {
        return fail("invalid_geometry", prefix + ".geometry must be line or cubic_bezier");
      }
      Json::Value normalizedGeometry;
      normalizedGeometry["type"] = geometry["type"].asString();
      if (geometry["type"].asString() == "line") {
        if (!hasOnlyMembers(geometry, {"type"})) return fail("invalid_geometry", prefix + ".line contains unsupported fields");
      } else {
        if (!hasOnlyMembers(geometry, {"type", "control1", "control2"})) return fail("invalid_geometry", prefix + ".cubic_bezier has an invalid shape");
        for (const auto *control : {"control1", "control2"}) {
          if (!geometry[control].isObject() || !hasOnlyMembers(geometry[control], {"x", "y"}) ||
              !finiteNumber(geometry[control]["x"]) || !finiteNumber(geometry[control]["y"])) {
            return fail("invalid_geometry", prefix + ".control points must be finite x/y objects");
          }
          normalizedGeometry[control]["x"] = rounded(geometry[control]["x"].asDouble());
          normalizedGeometry[control]["y"] = rounded(geometry[control]["y"].asDouble());
        }
      }
      normalized["geometry"] = normalizedGeometry;
    }
    edges.push_back(std::move(normalized));
  }

  std::sort(nodes.begin(), nodes.end(), [](const auto &a, const auto &b) { return a["id"].asString() < b["id"].asString(); });
  std::sort(edges.begin(), edges.end(), [](const auto &a, const auto &b) { return a["id"].asString() < b["id"].asString(); });
  Json::Value normalized;
  normalized["schema_version"] = schemaVersion;
  normalized["coordinate_mode"] = coordinateMode;
  normalized["nodes"] = Json::arrayValue;
  normalized["edges"] = Json::arrayValue;
  for (const auto &node : nodes) normalized["nodes"].append(node);
  for (const auto &edge : edges) normalized["edges"].append(edge);

  if (schemaVersion == 2) {
    normalized["sampling"]["algorithm"] = "uniform-parameter-v1";
    normalized["sampling"]["spacing"] = rounded(spacing);
    normalized["sampling"]["precision"] = kPrecision;
    normalized["trajectories"] = Json::arrayValue;
    std::size_t totalSamples = 0;
    for (const auto &edge : edges) {
      auto samples = sampleEdge(edge, positions.at(edge["from"].asString()),
                                positions.at(edge["to"].asString()), spacing);
      if (samples.empty()) return fail("too_many_samples", "an edge exceeds the per-trajectory sample limit");
      totalSamples += samples.size();
      normalized["trajectories"].append(makeTrajectory(edge, samples, "forward"));
      if (edge["direction"].asString() == "both") {
        std::reverse(samples.begin(), samples.end());
        totalSamples += samples.size();
        normalized["trajectories"].append(makeTrajectory(edge, samples, "reverse"));
      }
      if (totalSamples > kMaxSamples) return fail("too_many_samples", "network exceeds the total sample limit");
    }
  }

  auto canonical = canonicalString(normalized);
  if (canonical.size() > kMaxDocumentBytes) return fail("network_too_large", "canonical network exceeds 10 MiB");
  RoadNetworkValidation result;
  result.ok = true;
  result.normalized = std::move(normalized);
  result.canonicalJson = std::move(canonical);
  return result;
}

std::string roadNetworkTrajectoryCsv(const Json::Value &network) {
  if (!network.isObject() || network["schema_version"].asInt() != 2 || !network["trajectories"].isArray()) return {};
  std::ostringstream csv;
  csv << "trajectory_id,edge_id,direction,point_index,x,y,s,heading,max_speed_mps\n";
  csv << std::fixed << std::setprecision(kPrecision);
  for (const auto &trajectory : network["trajectories"]) {
    for (const auto &point : trajectory["points"]) {
      csv << trajectory["id"].asString() << ',' << trajectory["edge_id"].asString() << ','
          << trajectory["direction"].asString() << ',' << point["index"].asUInt64() << ','
          << point["x"].asDouble() << ',' << point["y"].asDouble() << ','
          << point["s"].asDouble() << ',' << point["heading"].asDouble() << ',';
      if (!trajectory["max_speed_mps"].isNull()) csv << trajectory["max_speed_mps"].asDouble();
      csv << '\n';
    }
  }
  return csv.str();
}

}  // namespace roc::service
