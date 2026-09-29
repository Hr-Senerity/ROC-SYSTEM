#include "utils/MapImport.h"

#include <yaml-cpp/yaml.h>
#include <zlib.h>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace roc::utils {
namespace {

constexpr std::size_t kMaxMapPixels = 40'000'000;

struct PgmImage {
  int width{0};
  int height{0};
  std::vector<unsigned char> pixels;
};

RosMapParseResult fail(const std::string &message) {
  return RosMapParseResult{std::nullopt, message};
}

bool finite(double value) { return std::isfinite(value); }

void skipSpaceAndComments(const std::string &bytes, std::size_t &offset) {
  while (offset < bytes.size()) {
    const auto value = static_cast<unsigned char>(bytes[offset]);
    if (value == '#') {
      while (offset < bytes.size() && bytes[offset] != '\n' && bytes[offset] != '\r') {
        ++offset;
      }
      continue;
    }
    if (value == ' ' || value == '\t' || value == '\r' || value == '\n' || value == '\f') {
      ++offset;
      continue;
    }
    break;
  }
}

std::string nextToken(const std::string &bytes, std::size_t &offset) {
  skipSpaceAndComments(bytes, offset);
  const auto start = offset;
  while (offset < bytes.size()) {
    const auto value = static_cast<unsigned char>(bytes[offset]);
    if (value == '#' || value == ' ' || value == '\t' || value == '\r' || value == '\n' ||
        value == '\f') {
      break;
    }
    ++offset;
  }
  return bytes.substr(start, offset - start);
}

std::optional<long long> parseInteger(const std::string &token) {
  if (token.empty()) return std::nullopt;
  std::size_t parsed = 0;
  try {
    const auto value = std::stoll(token, &parsed, 10);
    if (parsed != token.size()) return std::nullopt;
    return value;
  } catch (...) {
    return std::nullopt;
  }
}

std::optional<PgmImage> parsePgm(const std::string &bytes, std::string &error) {
  std::size_t offset = 0;
  const auto magic = nextToken(bytes, offset);
  if (magic != "P2" && magic != "P5") {
    error = "PGM must use P2 or P5 encoding";
    return std::nullopt;
  }
  const auto widthValue = parseInteger(nextToken(bytes, offset));
  const auto heightValue = parseInteger(nextToken(bytes, offset));
  const auto maxValue = parseInteger(nextToken(bytes, offset));
  if (!widthValue || !heightValue || !maxValue || *widthValue <= 0 || *heightValue <= 0 ||
      *widthValue > 100000 || *heightValue > 100000 || *maxValue <= 0 || *maxValue > 65535) {
    error = "PGM header contains invalid dimensions or max value";
    return std::nullopt;
  }
  const auto pixelCount = static_cast<std::uint64_t>(*widthValue) *
                          static_cast<std::uint64_t>(*heightValue);
  if (pixelCount > kMaxMapPixels) {
    error = "PGM exceeds the 40 million pixel limit";
    return std::nullopt;
  }

  PgmImage image;
  image.width = static_cast<int>(*widthValue);
  image.height = static_cast<int>(*heightValue);
  image.pixels.reserve(static_cast<std::size_t>(pixelCount));
  const auto normalize = [maximum = *maxValue](long long sample) {
    return static_cast<unsigned char>((sample * 255 + maximum / 2) / maximum);
  };

  if (magic == "P2") {
    for (std::uint64_t index = 0; index < pixelCount; ++index) {
      const auto sample = parseInteger(nextToken(bytes, offset));
      if (!sample || *sample < 0 || *sample > *maxValue) {
        error = "PGM pixel data is incomplete or out of range";
        return std::nullopt;
      }
      image.pixels.push_back(normalize(*sample));
    }
    skipSpaceAndComments(bytes, offset);
    if (offset != bytes.size()) {
      error = "PGM contains unexpected trailing pixel data";
      return std::nullopt;
    }
    return image;
  }

  if (offset >= bytes.size()) {
    error = "PGM pixel data is missing";
    return std::nullopt;
  }
  if (bytes[offset] == '\r' && offset + 1 < bytes.size() && bytes[offset + 1] == '\n') {
    offset += 2;
  } else if (bytes[offset] == ' ' || bytes[offset] == '\t' || bytes[offset] == '\r' ||
             bytes[offset] == '\n' || bytes[offset] == '\f') {
    ++offset;
  } else {
    error = "PGM binary header is not terminated by whitespace";
    return std::nullopt;
  }
  const auto bytesPerSample = *maxValue < 256 ? std::size_t{1} : std::size_t{2};
  const auto required = static_cast<std::size_t>(pixelCount) * bytesPerSample;
  if (bytes.size() - offset != required) {
    error = "PGM binary pixel length does not match its dimensions";
    return std::nullopt;
  }
  for (std::size_t index = 0; index < static_cast<std::size_t>(pixelCount); ++index) {
    long long sample = static_cast<unsigned char>(bytes[offset + index * bytesPerSample]);
    if (bytesPerSample == 2) {
      sample = (sample << 8) |
               static_cast<unsigned char>(bytes[offset + index * bytesPerSample + 1]);
    }
    if (sample > *maxValue) {
      error = "PGM binary pixel is out of range";
      return std::nullopt;
    }
    image.pixels.push_back(normalize(sample));
  }
  return image;
}

void appendBigEndian(std::string &target, std::uint32_t value) {
  target.push_back(static_cast<char>((value >> 24) & 0xff));
  target.push_back(static_cast<char>((value >> 16) & 0xff));
  target.push_back(static_cast<char>((value >> 8) & 0xff));
  target.push_back(static_cast<char>(value & 0xff));
}

void appendChunk(std::string &png, const char type[4], const std::string &data) {
  appendBigEndian(png, static_cast<std::uint32_t>(data.size()));
  const auto typeOffset = png.size();
  png.append(type, 4);
  png.append(data);
  const auto checksum = crc32(0L, reinterpret_cast<const Bytef *>(png.data() + typeOffset),
                              static_cast<uInt>(4 + data.size()));
  appendBigEndian(png, static_cast<std::uint32_t>(checksum));
}

std::string encodeGrayscalePng(const PgmImage &image) {
  std::string scanlines;
  scanlines.reserve((static_cast<std::size_t>(image.width) + 1) * image.height);
  for (int row = 0; row < image.height; ++row) {
    scanlines.push_back('\0');
    const auto begin = image.pixels.begin() + static_cast<std::ptrdiff_t>(row) * image.width;
    scanlines.append(reinterpret_cast<const char *>(&*begin),
                     static_cast<std::size_t>(image.width));
  }
  uLongf compressedSize = compressBound(static_cast<uLong>(scanlines.size()));
  std::string compressed(compressedSize, '\0');
  if (compress2(reinterpret_cast<Bytef *>(compressed.data()), &compressedSize,
                reinterpret_cast<const Bytef *>(scanlines.data()),
                static_cast<uLong>(scanlines.size()), Z_BEST_SPEED) != Z_OK) {
    throw std::runtime_error("Unable to encode PGM preview");
  }
  compressed.resize(compressedSize);

  std::string ihdr;
  appendBigEndian(ihdr, static_cast<std::uint32_t>(image.width));
  appendBigEndian(ihdr, static_cast<std::uint32_t>(image.height));
  ihdr.push_back(8);
  ihdr.push_back(0);
  ihdr.push_back(0);
  ihdr.push_back(0);
  ihdr.push_back(0);

  std::string png("\x89PNG\r\n\x1a\n", 8);
  appendChunk(png, "IHDR", ihdr);
  appendChunk(png, "IDAT", compressed);
  appendChunk(png, "IEND", {});
  return png;
}

bool safeImageReference(const std::string &value) {
  if (value.empty() || value.front() == '/' || value.front() == '\\' ||
      (value.size() > 1 && value[1] == ':')) {
    return false;
  }
  std::string normalized = value;
  std::replace(normalized.begin(), normalized.end(), '\\', '/');
  std::size_t start = 0;
  while (start <= normalized.size()) {
    const auto end = normalized.find('/', start);
    const auto part = normalized.substr(start, end == std::string::npos ? end : end - start);
    if (part == "..") return false;
    if (end == std::string::npos) break;
    start = end + 1;
  }
  const auto slash = normalized.find_last_of('/');
  const auto baseName = normalized.substr(slash == std::string::npos ? 0 : slash + 1);
  const auto dot = baseName.find_last_of('.');
  if (dot == std::string::npos) return false;
  auto extension = baseName.substr(dot);
  std::transform(extension.begin(), extension.end(), extension.begin(),
                 [](unsigned char value) { return static_cast<char>(std::tolower(value)); });
  return extension == ".pgm";
}

}  // namespace

RosMapParseResult parseRosMapSource(const std::string &pgmBytes,
                                    const std::string &yamlBytes) {
  try {
    const auto document = YAML::Load(yamlBytes);
    if (!document.IsMap()) return fail("YAML root must be a mapping");
    for (const auto *key : {"image", "resolution", "origin", "negate", "occupied_thresh",
                            "free_thresh"}) {
      if (!document[key]) return fail(std::string("YAML field is required: ") + key);
    }
    RosMapSource source;
    source.imageReference = document["image"].as<std::string>();
    if (!safeImageReference(source.imageReference)) {
      return fail("YAML image must reference a relative .pgm file without parent traversal");
    }
    source.resolution = document["resolution"].as<double>();
    const auto origin = document["origin"];
    if (!origin.IsSequence() || origin.size() != 3) {
      return fail("YAML origin must contain exactly [x, y, yaw]");
    }
    source.originX = origin[0].as<double>();
    source.originY = origin[1].as<double>();
    source.originTheta = origin[2].as<double>();
    source.negate = document["negate"].as<int>();
    source.occupiedThreshold = document["occupied_thresh"].as<double>();
    source.freeThreshold = document["free_thresh"].as<double>();
    if (document["mode"]) source.mode = document["mode"].as<std::string>();
    if (!finite(source.resolution) || source.resolution <= 0 || !finite(source.originX) ||
        !finite(source.originY) || !finite(source.originTheta)) {
      return fail("YAML resolution and origin values must be finite; resolution must be positive");
    }
    if (source.negate != 0 && source.negate != 1) {
      return fail("YAML negate must be 0 or 1");
    }
    if (!finite(source.freeThreshold) || !finite(source.occupiedThreshold) ||
        source.freeThreshold < 0 || source.occupiedThreshold > 1 ||
        source.freeThreshold >= source.occupiedThreshold) {
      return fail("YAML thresholds must satisfy 0 <= free_thresh < occupied_thresh <= 1");
    }
    if (source.mode != "trinary" && source.mode != "scale" && source.mode != "raw") {
      return fail("YAML mode must be trinary, scale, or raw");
    }

    std::string pgmError;
    const auto pgm = parsePgm(pgmBytes, pgmError);
    if (!pgm) return fail(pgmError);
    source.width = pgm->width;
    source.height = pgm->height;
    source.previewPng = encodeGrayscalePng(*pgm);
    return RosMapParseResult{source, {}};
  } catch (const YAML::Exception &error) {
    return fail(std::string("Invalid map YAML: ") + error.what());
  } catch (const std::exception &error) {
    return fail(error.what());
  }
}

}  // namespace roc::utils
