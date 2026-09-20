#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace roc::utils {

struct ImageMetadata {
  std::string contentType;
  std::string extension;
  int width{0};
  int height{0};
};

std::optional<ImageMetadata> inspectImage(const std::string &bytes);

}  // namespace roc::utils
