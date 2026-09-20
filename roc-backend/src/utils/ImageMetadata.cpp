#include "utils/ImageMetadata.h"

#include <cstddef>

namespace roc::utils {
namespace {

std::uint16_t be16(const std::string &bytes, std::size_t offset) {
  return (static_cast<unsigned char>(bytes[offset]) << 8) |
         static_cast<unsigned char>(bytes[offset + 1]);
}

std::uint32_t be32(const std::string &bytes, std::size_t offset) {
  return (static_cast<std::uint32_t>(static_cast<unsigned char>(bytes[offset])) << 24) |
         (static_cast<std::uint32_t>(static_cast<unsigned char>(bytes[offset + 1])) << 16) |
         (static_cast<std::uint32_t>(static_cast<unsigned char>(bytes[offset + 2])) << 8) |
         static_cast<unsigned char>(bytes[offset + 3]);
}

bool isJpegSof(unsigned char marker) {
  return (marker >= 0xc0 && marker <= 0xc3) ||
         (marker >= 0xc5 && marker <= 0xc7) ||
         (marker >= 0xc9 && marker <= 0xcb) ||
         (marker >= 0xcd && marker <= 0xcf);
}

}  // namespace

std::optional<ImageMetadata> inspectImage(const std::string &bytes) {
  if (bytes.size() >= 24 &&
      static_cast<unsigned char>(bytes[0]) == 0x89 && bytes.substr(1, 3) == "PNG" &&
      static_cast<unsigned char>(bytes[4]) == 0x0d &&
      static_cast<unsigned char>(bytes[5]) == 0x0a &&
      static_cast<unsigned char>(bytes[6]) == 0x1a &&
      static_cast<unsigned char>(bytes[7]) == 0x0a && bytes.substr(12, 4) == "IHDR") {
    const auto width = be32(bytes, 16);
    const auto height = be32(bytes, 20);
    if (width == 0 || height == 0 || width > 100000 || height > 100000) return std::nullopt;
    return ImageMetadata{"image/png", ".png", static_cast<int>(width), static_cast<int>(height)};
  }

  if (bytes.size() < 4 || static_cast<unsigned char>(bytes[0]) != 0xff ||
      static_cast<unsigned char>(bytes[1]) != 0xd8) {
    return std::nullopt;
  }
  std::size_t offset = 2;
  while (offset + 3 < bytes.size()) {
    if (static_cast<unsigned char>(bytes[offset]) != 0xff) {
      ++offset;
      continue;
    }
    while (offset < bytes.size() && static_cast<unsigned char>(bytes[offset]) == 0xff) ++offset;
    if (offset >= bytes.size()) break;
    const auto marker = static_cast<unsigned char>(bytes[offset++]);
    if (marker == 0xd8 || marker == 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.size()) break;
    const auto length = be16(bytes, offset);
    if (length < 2 || offset + length > bytes.size()) break;
    if (isJpegSof(marker) && length >= 7) {
      const auto height = be16(bytes, offset + 3);
      const auto width = be16(bytes, offset + 5);
      if (width == 0 || height == 0) return std::nullopt;
      return ImageMetadata{"image/jpeg", ".jpg", static_cast<int>(width), static_cast<int>(height)};
    }
    offset += length;
  }
  return std::nullopt;
}

}  // namespace roc::utils
