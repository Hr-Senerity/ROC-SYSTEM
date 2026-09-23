#include "utils/InvitationCode.h"

#include <array>
#include <cctype>
#include <stdexcept>

#include <openssl/rand.h>

namespace roc::utils {

std::optional<std::string> normalizeInvitationCode(std::string_view value) {
  if (value.size() != 5) return std::nullopt;

  std::string normalized;
  normalized.reserve(value.size());
  bool hasLetter = false;
  bool hasDigit = false;
  for (const unsigned char character : value) {
    if (!std::isalnum(character) || character > 0x7f) return std::nullopt;
    const char upper = static_cast<char>(std::toupper(character));
    normalized.push_back(upper);
    hasLetter = hasLetter || (upper >= 'A' && upper <= 'Z');
    hasDigit = hasDigit || (upper >= '0' && upper <= '9');
  }
  if (!hasLetter || !hasDigit) return std::nullopt;
  return normalized;
}

std::string generateInvitationCode() {
  static constexpr char kAlphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  static_assert(sizeof(kAlphabet) - 1 == 32);

  for (int attempt = 0; attempt < 64; ++attempt) {
    std::array<unsigned char, 5> randomBytes{};
    if (RAND_bytes(randomBytes.data(), randomBytes.size()) != 1) {
      throw std::runtime_error("Unable to generate secure invitation code");
    }

    std::string code;
    code.reserve(randomBytes.size());
    bool hasLetter = false;
    bool hasDigit = false;
    for (const auto byte : randomBytes) {
      const char character = kAlphabet[byte & 31U];
      code.push_back(character);
      hasLetter = hasLetter || (character >= 'A' && character <= 'Z');
      hasDigit = hasDigit || (character >= '0' && character <= '9');
    }
    if (hasLetter && hasDigit) return code;
  }

  throw std::runtime_error("Unable to generate mixed invitation code");
}

}  // namespace roc::utils
