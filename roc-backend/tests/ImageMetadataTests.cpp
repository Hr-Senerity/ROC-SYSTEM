#include <cassert>
#include <string>

#include "utils/ImageMetadata.h"

int main() {
  std::string png(24, '\0');
  png[0] = static_cast<char>(0x89); png.replace(1, 3, "PNG");
  png[4] = '\r'; png[5] = '\n'; png[6] = static_cast<char>(0x1a); png[7] = '\n';
  png.replace(12, 4, "IHDR");
  png[18] = 0x02; png[19] = static_cast<char>(0x80);
  png[22] = 0x01; png[23] = static_cast<char>(0xe0);
  const auto parsedPng = roc::utils::inspectImage(png);
  assert(parsedPng && parsedPng->contentType == "image/png");
  assert(parsedPng->width == 640 && parsedPng->height == 480);

  const std::string jpeg = {
      static_cast<char>(0xff), static_cast<char>(0xd8),
      static_cast<char>(0xff), static_cast<char>(0xc0), 0x00, 0x11, 0x08,
      0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00};
  const auto parsedJpeg = roc::utils::inspectImage(jpeg);
  assert(parsedJpeg && parsedJpeg->contentType == "image/jpeg");
  assert(parsedJpeg->width == 600 && parsedJpeg->height == 300);
  assert(!roc::utils::inspectImage("not an image"));
}
