cmake_minimum_required(VERSION 3.16)

project(roc_backend LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Drogon + libpqxx + OpenSSL
find_package(Drogon CONFIG REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(PQXX REQUIRED IMPORTED_TARGET libpqxx)
find_package(OpenSSL REQUIRED)

add_executable(roc-backend-server
  src/main.cpp
  src/config/AppConfig.cpp
  src/config/AppConfig.h
  src/db/PostgresClient.cpp
  src/db/PostgresClient.h
  src/utils/PasswordHash.cpp
  src/utils/PasswordHash.h
  src/utils/JwtHelper.cpp
  src/utils/JwtHelper.h
  src/models/User.h
  src/controllers/AuthController.cpp
  src/controllers/AuthController.h
  src/controllers/AdminController.cpp
  src/controllers/AdminController.h
  src/controllers/ProjectController.cpp
  src/controllers/ProjectController.h
  src/controllers/VehicleController.cpp
  src/controllers/VehicleController.h
  src/controllers/StatusWsController.cpp
  src/controllers/StatusWsController.h
  src/middleware/AuthMiddleware.cpp
  src/middleware/AuthMiddleware.h
  src/protocols/common/types.h
  src/protocols/ProtocolSerializer.h
  src/protocols/JsonSerializer.cpp
  src/protocols/JsonSerializer.h
  src/protocols/RocSerializer.cpp
  src/protocols/RocSerializer.h
  src/protocols/ProtocolBridge.cpp
  src/protocols/ProtocolBridge.h
  src/protocols/roc/roc_bridge.cpp
)

target_include_directories(roc-backend-server PRIVATE src)
target_link_libraries(roc-backend-server PRIVATE
  Drogon::Drogon
  PkgConfig::PQXX
  OpenSSL::SSL
  OpenSSL::Crypto
)
