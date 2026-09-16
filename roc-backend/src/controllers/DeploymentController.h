#pragma once

#include <string>

#include "config/AppConfig.h"

namespace roc::controller {

void registerDeploymentRoutes(const roc::config::AppConfig &config,
                              const std::string &connStr);

}  // namespace roc::controller