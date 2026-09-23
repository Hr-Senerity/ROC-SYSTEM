#include <cassert>
#include <cctype>
#include <iostream>

#include "utils/InvitationCode.h"

int main() {
  const auto normalized = roc::utils::normalizeInvitationCode("a2b3c");
  assert(normalized.has_value());
  assert(*normalized == "A2B3C");
  assert(!roc::utils::normalizeInvitationCode("ABCD").has_value());
  assert(!roc::utils::normalizeInvitationCode("ABC-1").has_value());
  assert(!roc::utils::normalizeInvitationCode("ABCDE1").has_value());
  assert(!roc::utils::normalizeInvitationCode("ABCDE").has_value());
  assert(!roc::utils::normalizeInvitationCode("12345").has_value());

  for (int index = 0; index < 128; ++index) {
    const auto code = roc::utils::generateInvitationCode();
    assert(code.size() == 5);
    bool hasLetter = false;
    bool hasDigit = false;
    for (const unsigned char character : code) {
      assert(std::isalnum(character));
      assert(character == std::toupper(character));
      hasLetter = hasLetter || std::isalpha(character);
      hasDigit = hasDigit || std::isdigit(character);
    }
    assert(hasLetter && hasDigit);
  }

  std::cout << "Invitation code tests passed\n";
  return 0;
}
