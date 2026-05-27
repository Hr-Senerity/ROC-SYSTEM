#pragma once

#include <string>

namespace roc::utils {

std::string sha256Hex(const std::string &input);

std::string generateSalt(size_t length = 16);

std::string hashPassword(const std::string &password, const std::string &salt);

bool verifyPassword(const std::string &password, const std::string &salt, const std::string &hash);

}  // namespace roc::utils
