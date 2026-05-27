#pragma once

#include <drogon/drogon.h>
#include "config/AppConfig.h"

namespace roc::controller {

void registerVehicleRoutes(const roc::config::AppConfig &cfg, const std::string &connStr);

}  // namespace roc::controller
