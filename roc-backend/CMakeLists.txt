cmake_minimum_required(VERSION 3.16)

project(roc_backend LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Drogon + libpqxx
find_package(Drogon CONFIG REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(PQXX REQUIRED IMPORTED_TARGET libpqxx)

add_executable(roc-backend-server
  src/main.cpp
  src/config/AppConfig.cpp
  src/config/AppConfig.h
  src/db/PostgresClient.cpp
  src/db/PostgresClient.h
)

target_include_directories(roc-backend-server PRIVATE src)
target_link_libraries(roc-backend-server PRIVATE Drogon::Drogon PkgConfig::PQXX)
