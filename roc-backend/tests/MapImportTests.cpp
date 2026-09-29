#include <cassert>
#include <string>

#include "utils/ImageMetadata.h"
#include "utils/MapImport.h"

int main() {
  const std::string yaml =
      "image: map.pgm\n"
      "resolution: 0.05\n"
      "origin: [-10.0, -20.0, 0.25]\n"
      "negate: 0\n"
      "occupied_thresh: 0.65\n"
      "free_thresh: 0.196\n";

  const auto ascii = roc::utils::parseRosMapSource(
      "P2\n# generated fixture\n3 2\n255\n0 64 128\n192 254 255\n", yaml);
  assert(ascii.value);
  assert(ascii.value->width == 3 && ascii.value->height == 2);
  assert(ascii.value->resolution == 0.05);
  assert(ascii.value->originX == -10.0 && ascii.value->originY == -20.0);
  const auto preview = roc::utils::inspectImage(ascii.value->previewPng);
  assert(preview && preview->contentType == "image/png");
  assert(preview->width == 3 && preview->height == 2);

  std::string binary = "P5\n2 2\n255\n";
  binary.append("\0\x40\x80\xff", 4);
  const auto raw = roc::utils::parseRosMapSource(binary, yaml);
  assert(raw.value && raw.value->width == 2 && raw.value->height == 2);

  const auto traversal = roc::utils::parseRosMapSource(
      binary, "image: ../map.pgm\nresolution: 0.05\norigin: [0, 0, 0]\nnegate: 0\n"
              "occupied_thresh: 0.65\nfree_thresh: 0.2\n");
  assert(!traversal.value);

  const auto badThreshold = roc::utils::parseRosMapSource(
      binary, "image: map.pgm\nresolution: 0.05\norigin: [0, 0, 0]\nnegate: 0\n"
              "occupied_thresh: 0.2\nfree_thresh: 0.65\n");
  assert(!badThreshold.value);
}
