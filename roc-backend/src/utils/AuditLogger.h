#pragma once

#include <string>

namespace roc::utils {

// Log an audit event to the audit_logs table
void auditLog(const std::string &connStr,
              const std::string &userId,
              const std::string &action,
              const std::string &targetType = "",
              const std::string &targetId = "",
              const std::string &detail = "",
              const std::string &ip = "");

}  // namespace roc::utils
