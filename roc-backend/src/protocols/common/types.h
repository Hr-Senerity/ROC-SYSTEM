// ROC-SYSTEM JSON Device Protocol domain types

#pragma once

#include <chrono>
#include <string>

namespace roc::protocol {

struct RobotStatus {
  std::string robot_id;
  bool online{false};
  double cpu_usage{0.0};
  double memory_usage{0.0};
  int battery_level{100};
  double localization_confidence{0.0};

  double position_x{0.0};
  double position_y{0.0};
  double position_theta{0.0};

  double velocity_linear{0.0};
  double velocity_angular{0.0};

  std::chrono::system_clock::time_point timestamp{
      std::chrono::system_clock::now()};
};

}  // namespace roc::protocol