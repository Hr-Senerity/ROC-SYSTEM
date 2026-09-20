#include "services/RoadNetworkService.h"

#include <algorithm>
#include <cmath>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

namespace roc::service {
namespace {

constexpr Json::ArrayIndex kMaxNodes = 10000;
constexpr Json::ArrayIndex kMaxEdges = 50000;
constexpr double kMaxSpeedMps = 100.0;
constexpr std::size_t kMaxDocumentBytes = 10 * 1024 * 1024;

RoadNetworkValidation fail(const std::string &code,
                           const std::string &message) {
  RoadNetworkValidation result;
  result.code = code;
  result.message = message;
  return result;
}

bool hasOnlyMembers(const Json::Value &value,
                    const std::set<std::string> &allowed) {
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

std::string canonicalString(const Json::Value &value) {
  Json::StreamWriterBuilder writer;
  writer["indentation"] = "";
  writer["commentStyle"] = "None";
  writer["enableYAMLCompatibility"] = false;
  writer["dropNullPlaceholders"] = false;
  writer["emitUTF8"] = true;
  return Json::writeString(writer, value);
}

}  // namespace

RoadNetworkValidation validateRoadNetwork(const Json::Value &network,
                                           const std::string &coordinateMode) {
  if (!network.isObject()) {
    return fail("invalid_network", "network must be a JSON object");
  }
  if (!hasOnlyMembers(network,
                      {"schema_version", "coordinate_mode", "nodes", "edges"})) {
    return fail("unknown_field", "network contains an unsupported field");
  }
  if (!network["schema_version"].isInt() ||
      network["schema_version"].asInt() != 1) {
    return fail("unsupported_schema", "schema_version must be 1");
  }
  if (!network["coordinate_mode"].isString() ||
      (network["coordinate_mode"].asString() != "metric" &&
       network["coordinate_mode"].asString() != "legacy-normalized")) {
    return fail("invalid_coordinate_mode",
                "coordinate_mode must be metric or legacy-normalized");
  }
  if (network["coordinate_mode"].asString() != coordinateMode) {
    return fail("coordinate_mode_mismatch",
                "network coordinate_mode does not match the map");
  }
  if (!network["nodes"].isArray() || !network["edges"].isArray()) {
    return fail("invalid_network", "nodes and edges must be arrays");
  }
  if (network["nodes"].size() > kMaxNodes ||
      network["edges"].size() > kMaxEdges) {
    return fail("network_too_large", "network exceeds the node or edge limit");
  }

  std::unordered_set<std::string> nodeIds;
  std::vector<Json::Value> nodes;
  nodes.reserve(network["nodes"].size());
  for (Json::ArrayIndex index = 0; index < network["nodes"].size(); ++index) {
    const auto &node = network["nodes"][index];
    const auto prefix = "nodes[" + std::to_string(index) + "]";
    if (!node.isObject() ||
        !hasOnlyMembers(node, {"id", "x", "y", "kind", "label"})) {
      return fail("invalid_node", prefix + " has an invalid shape");
    }
    if (!node["id"].isString() || !validIdentifier(node["id"].asString())) {
      return fail("invalid_node", prefix + ".id is invalid");
    }
    const auto id = node["id"].asString();
    if (!nodeIds.insert(id).second) {
      return fail("duplicate_node", "duplicate node id: " + id);
    }
    if (!finiteNumber(node["x"]) || !finiteNumber(node["y"])) {
      return fail("invalid_node", prefix + " coordinates must be finite numbers");
    }
    if (!node["kind"].isString() || node["kind"].asString() != "waypoint") {
      return fail("invalid_node", prefix + ".kind must be waypoint");
    }
    if (!node["label"].isString() || node["label"].asString().size() > 128) {
      return fail("invalid_node", prefix + ".label must be at most 128 bytes");
    }

    Json::Value normalized;
    normalized["id"] = id;
    normalized["x"] = node["x"].asDouble();
    normalized["y"] = node["y"].asDouble();
    normalized["kind"] = "waypoint";
    normalized["label"] = node["label"].asString();
    nodes.push_back(std::move(normalized));
  }

  std::unordered_set<std::string> edgeIds;
  std::unordered_set<std::string> edgeKeys;
  std::vector<Json::Value> edges;
  edges.reserve(network["edges"].size());
  for (Json::ArrayIndex index = 0; index < network["edges"].size(); ++index) {
    const auto &edge = network["edges"][index];
    const auto prefix = "edges[" + std::to_string(index) + "]";
    if (!edge.isObject() ||
        !hasOnlyMembers(edge,
                        {"id", "from", "to", "direction", "max_speed_mps"})) {
      return fail("invalid_edge", prefix + " has an invalid shape");
    }
    if (!edge["id"].isString() || !validIdentifier(edge["id"].asString()) ||
        !edge["from"].isString() || !edge["to"].isString()) {
      return fail("invalid_edge", prefix + " identifiers are invalid");
    }
    const auto id = edge["id"].asString();
    const auto from = edge["from"].asString();
    const auto to = edge["to"].asString();
    if (!edgeIds.insert(id).second) {
      return fail("duplicate_edge", "duplicate edge id: " + id);
    }
    if (nodeIds.count(from) == 0 || nodeIds.count(to) == 0) {
      return fail("dangling_edge", prefix + " references a missing node");
    }
    if (from == to) return fail("self_loop", prefix + " cannot connect a node to itself");
    if (!edge["direction"].isString() ||
        (edge["direction"].asString() != "both" &&
         edge["direction"].asString() != "forward")) {
      return fail("invalid_edge", prefix + ".direction must be both or forward");
    }
    const auto direction = edge["direction"].asString();
    const auto key = direction == "both"
        ? direction + ":" + std::min(from, to) + ":" + std::max(from, to)
        : direction + ":" + from + ":" + to;
    if (!edgeKeys.insert(key).second) {
      return fail("duplicate_edge", prefix + " duplicates an existing connection");
    }
    if (edge.isMember("max_speed_mps") && !edge["max_speed_mps"].isNull()) {
      if (!finiteNumber(edge["max_speed_mps"]) ||
          edge["max_speed_mps"].asDouble() <= 0 ||
          edge["max_speed_mps"].asDouble() > kMaxSpeedMps) {
        return fail("invalid_edge",
                    prefix + ".max_speed_mps must be greater than 0 and at most 100");
      }
    }

    Json::Value normalized;
    normalized["id"] = id;
    normalized["from"] = from;
    normalized["to"] = to;
    normalized["direction"] = direction;
    normalized["max_speed_mps"] =
        edge.isMember("max_speed_mps") && !edge["max_speed_mps"].isNull()
        ? Json::Value(edge["max_speed_mps"].asDouble())
        : Json::Value(Json::nullValue);
    edges.push_back(std::move(normalized));
  }

  std::sort(nodes.begin(), nodes.end(), [](const auto &left, const auto &right) {
    return left["id"].asString() < right["id"].asString();
  });
  std::sort(edges.begin(), edges.end(), [](const auto &left, const auto &right) {
    return left["id"].asString() < right["id"].asString();
  });

  Json::Value normalized;
  normalized["schema_version"] = 1;
  normalized["coordinate_mode"] = coordinateMode;
  normalized["nodes"] = Json::arrayValue;
  normalized["edges"] = Json::arrayValue;
  for (const auto &node : nodes) normalized["nodes"].append(node);
  for (const auto &edge : edges) normalized["edges"].append(edge);

  auto canonical = canonicalString(normalized);
  if (canonical.size() > kMaxDocumentBytes) {
    return fail("network_too_large", "canonical network exceeds 10 MiB");
  }

  RoadNetworkValidation result;
  result.ok = true;
  result.normalized = std::move(normalized);
  result.canonicalJson = std::move(canonical);
  return result;
}

}  // namespace roc::service
