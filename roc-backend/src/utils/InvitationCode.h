#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace roc::utils {

// Accept five ASCII letters/digits and normalize letters to uppercase.
std::optional<std::string> normalizeInvitationCode(std::string_view value);

// Generate a five-character code containing at least one letter and one digit.
// Ambiguous characters I/O/0/1 are excluded from generated values.
std::string generateInvitationCode();

}  // namespace roc::utils
