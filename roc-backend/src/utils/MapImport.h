#pragma once

#include <optional>
#include <string>

namespace roc::utils {

struct RosMapSource {
  int width{0};
  int height{0};
  double resolution{0};
  double originX{0};
  double originY{0};
  double originTheta{0};
  int negate{0};
  double occupiedThreshold{0.65};
  double freeThreshold{0.196};
  std::string mode{"trinary"};
  std::string imageReference;
  std::string previewPng;
};

struct RosMapParseResult {
  std::optional<RosMapSource> value;
  std::string error;
};

RosMapParseResult parseRosMapSource(const std::string &pgmBytes,
                                    const std::string &yamlBytes);

}  // namespace roc::utils
