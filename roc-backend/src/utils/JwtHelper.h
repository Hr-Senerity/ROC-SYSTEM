#pragma once

#include <json/json.h>
#include <string>
#include <optional>

namespace roc::utils {

std::string base64UrlEncode(const std::string &input);
std::string base64UrlDecode(const std::string &input);

std::string hmacSha256(const std::string &key, const std::string &data);

std::string createJwt(const Json::Value &payload, const std::string &secret);

std::optional<Json::Value> verifyJwt(const std::string &token, const std::string &secret);

}  // namespace roc::utils
