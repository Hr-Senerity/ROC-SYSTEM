#pragma once

#include <string>

namespace roc::model {

struct User {
  std::string id;
  std::string username;
  std::string email;
  std::string passwordHash;
  std::string salt;
  std::string role;    // "super_admin" | "regular"
  std::string status;  // "active" | "disabled"
  std::string avatar;
  std::string createdAt;
  std::string updatedAt;
};

}  // namespace roc::model
