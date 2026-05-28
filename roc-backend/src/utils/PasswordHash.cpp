#include "utils/PasswordHash.h"

#include <openssl/evp.h>
#include <openssl/rand.h>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace roc::utils {

std::string sha256Hex(const std::string &input) {
  unsigned char hash[EVP_MAX_MD_SIZE];
  unsigned int hashLen = 0;

  EVP_MD_CTX *ctx = EVP_MD_CTX_new();
  if (!ctx) throw std::runtime_error("EVP_MD_CTX_new failed");

  EVP_DigestInit_ex(ctx, EVP_sha256(), nullptr);
  EVP_DigestUpdate(ctx, input.c_str(), input.size());
  EVP_DigestFinal_ex(ctx, hash, &hashLen);
  EVP_MD_CTX_free(ctx);

  std::ostringstream oss;
  for (unsigned int i = 0; i < hashLen; ++i) {
    oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(hash[i]);
  }
  return oss.str();
}

std::string generateSalt(size_t length) {
  std::vector<unsigned char> buf(length);
  if (RAND_bytes(buf.data(), static_cast<int>(buf.size())) != 1) {
    throw std::runtime_error("RAND_bytes failed");
  }
  std::ostringstream oss;
  for (auto c : buf) {
    oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(c);
  }
  return oss.str();
}

std::string hashPassword(const std::string &password, const std::string &salt) {
  return sha256Hex(password + salt);
}

bool verifyPassword(const std::string &password, const std::string &salt, const std::string &hash) {
  return hashPassword(password, salt) == hash;
}

}  // namespace roc::utils
