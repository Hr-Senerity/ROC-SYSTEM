// ROC-SYSTEM 通用协议类型定义
// 用于 C++ 后端

#ifndef ROC_PROTOCOL_TYPES_H
#define ROC_PROTOCOL_TYPES_H

#include <string>
#include <vector>
#include <chrono>
#include <cstdint>

namespace roc {
namespace protocol {

// 协议类型枚举
enum class ProtocolType {
    ROS,    // Robot Operating System
    ROC,    // Robot Operation Control
    JSON    // JSON over HTTP/WebSocket
};

// 消息类型枚举
enum class MessageType {
    CONTROL,        // 控制指令
    STATUS_QUERY,   // 状态查询
    STATUS_REPORT,  // 状态上报
    CONFIG_UPDATE,  // 配置更新
    HEARTBEAT,      // 心跳包
    ERROR           // 错误消息
};

// 机器人消息结构
struct RobotMessage {
    std::string robot_id;
    ProtocolType protocol;
    MessageType type;
    std::chrono::system_clock::time_point timestamp;
    std::vector<uint8_t> payload;
    
    RobotMessage() 
        : protocol(ProtocolType::JSON)
        , type(MessageType::HEARTBEAT)
        , timestamp(std::chrono::system_clock::now())
    {}
};

// 机器人状态结构
struct RobotStatus {
    std::string robot_id;
    bool online;
    double cpu_usage;           // 0-100
    double memory_usage;        // 0-100
    int battery_level;          // 0-100
    double localization_confidence; // 0-100
    
    // 位置信息
    double position_x;
    double position_y;
    double position_theta;
    
    // 速度信息
    double velocity_linear;
    double velocity_angular;
    
    std::chrono::system_clock::time_point timestamp;
};

// 控制指令结构
struct ControlCommand {
    std::string robot_id;
    std::string command_type;   // "move", "stop", "task", etc.
    
    // 移动控制
    double linear_x;
    double linear_y;
    double linear_z;
    double angular_x;
    double angular_y;
    double angular_z;
    
    // 任务参数（JSON 字符串）
    std::string task_params;
};

} // namespace protocol
} // namespace roc

#endif // ROC_PROTOCOL_TYPES_H

