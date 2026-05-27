#include "utils/JwtHelper.h"

#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <json/json.h>
#include <sstream>
#include <stdexcept>
#include <chrono>

namespace roc::utils {

static const char BASE64_CHARS[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64UrlEncode(const std::string &input) {
  std::string encoded;
  encoded.reserve(((input.size() + 2) / 3) * 4);

  for (size_t i = 0; i < input.size(); i += 3) {
    uint32_t n = static_cast<unsigned char>(input[i]) << 16;
    if (i + 1 < input.size()) n |= static_cast<unsigned char>(input[i + 1]) << 8;
    if (i + 2 < input.size()) n |= static_cast<unsigned char>(input[i + 2]);

    encoded.push_back(BASE64_CHARS[(n >> 18) & 0x3F]);
    encoded.push_back(BASE64_CHARS[(n >> 12) & 0x3F]);
    encoded.push_back((i + 1 < input.size()) ? BASE64_CHARS[(n >> 6) & 0x3F] : '=');
    encoded.push_back((i + 2 < input.size()) ? BASE64_CHARS[n & 0x3F] : '=');
  }

  // Base64URL: replace +/ with -_ and remove padding =
  for (auto &c : encoded) {
    if (c == '+') c = '-';
    else if (c == '/') c = '_';
  }
  while (!encoded.empty() && encoded.back() == '=') {
    encoded.pop_back();
  }
  return encoded;
}

std::string base64UrlDecode(const std::string &input) {
  std::string s = input;
  // Restore padding
  while (s.size() % 4 != 0) s.push_back('=');
  // Restore base64 chars
  for (auto &c : s) {
    if (c == '-') c = '+';
    else if (c == '_') c = '/';
  }

  auto decodeChar = [](char c) -> int {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
  };

  std::string decoded;
  decoded.reserve((s.size() / 4) * 3);

  for (size_t i = 0; i < s.size(); i += 4) {
    int a = decodeChar(s[i]);
    int b = decodeChar(s[i + 1]);
    int c = (s[i + 2] == '=') ? 0 : decodeChar(s[i + 2]);
    int d = (s[i + 3] == '=') ? 0 : decodeChar(s[i + 3]);

    uint32_t n = (a << 18) | (b << 12) | (c << 6) | d;
    decoded.push_back(static_cast<char>((n >> 16) & 0xFF));
    if (s[i + 2] != '=') decoded.push_back(static_cast<char>((n >> 8) & 0xFF));
    if (s[i + 3] != '=') decoded.push_back(static_cast<char>(n & 0xFF));
  }
  return decoded;
}

std::string hmacSha256(const std::string &key, const std::string &data) {
  unsigned char result[EVP_MAX_MD_SIZE];
  unsigned int resultLen = 0;

  HMAC(EVP_sha256(), key.c_str(), static_cast<int>(key.size()),
       reinterpret_cast<const unsigned char *>(data.c_str()), data.size(),
       result, &resultLen);

  // Return raw bytes as string
  return std::string(reinterpret_cast<char *>(result), resultLen);
}

std::string createJwt(const Json::Value &payload, const std::string &secret) {
  Json::Value header;
  header["alg"] = "HS256";
  header["typ"] = "JWT";

  Json::StreamWriterBuilder wbuilder;
  wbuilder["indentation"] = "";
  std::string headerJson = Json::writeString(wbuilder, header);
  std::string payloadJson = Json::writeString(wbuilder, payload);

  std::string encodedHeader = base64UrlEncode(headerJson);
  std::string encodedPayload = base64UrlEncode(payloadJson);
  std::string signingInput = encodedHeader + "." + encodedPayload;
  std::string signature = base64UrlEncode(hmacSha256(secret, signingInput));

  return signingInput + "." + signature;
}

std::optional<Json::Value> verifyJwt(const std::string &token, const std::string &secret) {
  // Split token by '.'
  size_t firstDot = token.find('.');
  size_t secondDot = token.find('.', firstDot + 1);
  if (firstDot == std::string::npos || secondDot == std::string::npos) {
    return std::nullopt;
  }

  std::string encodedHeader = token.substr(0, firstDot);
  std::string encodedPayload = token.substr(firstDot + 1, secondDot - firstDot - 1);
  std::string signature = token.substr(secondDot + 1);

  // Verify signature
  std::string signingInput = encodedHeader + "." + encodedPayload;
  std::string expectedSig = base64UrlEncode(hmacSha256(secret, signingInput));
  if (signature != expectedSig) {
    return std::nullopt;
  }

  // Decode payload
  std::string payloadJson;
  try {
    payloadJson = base64UrlDecode(encodedPayload);
  } catch (...) {
    return std::nullopt;
  }

  Json::Value payload;
  Json::CharReaderBuilder rbuilder;
  std::string errs;
  std::istringstream iss(payloadJson);
  if (!Json::parseFromStream(rbuilder, iss, &payload, &errs)) {
    return std::nullopt;
  }

  // Check expiration
  if (payload.isMember("exp")) {
    auto now = std::chrono::system_clock::now();
    auto expTime = std::chrono::system_clock::time_point(
        std::chrono::seconds(payload["exp"].asInt64()));
    if (now > expTime) {
      return std::nullopt;
    }
  }

  return payload;
}

}  // namespace roc::utils
