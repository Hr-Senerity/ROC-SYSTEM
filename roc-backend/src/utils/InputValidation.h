#pragma once

#include <cctype>
#include <string>

namespace roc::utils {

inline bool isUuid(const std::string &value) {
  if (value.size() != 36) return false;
  for (size_t index = 0; index < value.size(); ++index) {
    const bool separator = index == 8 || index == 13 || index == 18 || index == 23;
    if (separator) {
      if (value[index] != '-') return false;
    } else if (!std::isxdigit(static_cast<unsigned char>(value[index]))) {
      return false;
    }
  }
  return true;
}

}  // namespace roc::utils
