cmake_minimum_required(VERSION 3.16)

project(roc_backend VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(CTest)

find_package(Drogon CONFIG REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(PQXX REQUIRED IMPORTED_TARGET libpqxx)
pkg_check_modules(JSONCPP REQUIRED IMPORTED_TARGET jsoncpp)
find_package(OpenSSL REQUIRED)

add_executable(roc-backend-server
  src/main.cpp
  src/config/AppConfig.cpp
  src/config/AppConfig.h
  src/db/PostgresClient.cpp
  src/db/PostgresClient.h
  src/db/ConnectionPool.cpp
  src/db/ConnectionPool.h
  src/utils/PasswordHash.cpp
  src/utils/PasswordHash.h
  src/utils/JwtHelper.cpp
  src/utils/JwtHelper.h
  src/utils/InputValidation.h
  src/utils/ImageMetadata.cpp
  src/utils/ImageMetadata.h
  src/utils/InvitationCode.cpp
  src/utils/InvitationCode.h
  src/models/User.h
  src/controllers/AuthController.cpp
  src/controllers/AuthController.h
  src/controllers/AdminController.cpp
  src/controllers/AdminController.h
  src/controllers/ProjectController.cpp
  src/controllers/ProjectController.h
  src/controllers/MapArtifactController.cpp
  src/controllers/MapArtifactController.h
  src/controllers/RoadNetworkController.cpp
  src/controllers/RoadNetworkController.h
  src/controllers/VehicleController.cpp
  src/controllers/VehicleController.h
  src/controllers/StatusWsController.cpp
  src/controllers/StatusWsController.h
  src/controllers/DeviceWsController.cpp
  src/controllers/DeviceWsController.h
  src/controllers/DeploymentController.cpp
  src/controllers/DeploymentController.h
  src/services/DeploymentService.cpp
  src/services/DeploymentService.h
  src/services/RoadNetworkService.cpp
  src/services/RoadNetworkService.h
  src/services/VehicleStatusService.cpp
  src/services/VehicleStatusService.h
  src/middleware/AuthMiddleware.cpp
  src/middleware/AuthMiddleware.h
  src/protocols/common/types.h
  src/protocols/DeviceProtocol.cpp
  src/protocols/DeviceProtocol.h
)

target_include_directories(roc-backend-server PRIVATE src)
target_link_libraries(roc-backend-server PRIVATE
  Drogon::Drogon
  PkgConfig::PQXX
  PkgConfig::JSONCPP
  OpenSSL::SSL
  OpenSSL::Crypto
)

if(BUILD_TESTING)
  add_executable(device-protocol-tests
    tests/DeviceProtocolTests.cpp
    src/protocols/DeviceProtocol.cpp
  )
  target_include_directories(device-protocol-tests PRIVATE src)
  target_link_libraries(device-protocol-tests PRIVATE PkgConfig::JSONCPP)
  add_test(NAME device-protocol-tests COMMAND device-protocol-tests)

  add_executable(road-network-tests
    tests/RoadNetworkTests.cpp
    src/services/RoadNetworkService.cpp
  )
  target_include_directories(road-network-tests PRIVATE src)
  target_link_libraries(road-network-tests PRIVATE PkgConfig::JSONCPP)
  add_test(NAME road-network-tests COMMAND road-network-tests)

  add_executable(image-metadata-tests
    tests/ImageMetadataTests.cpp
    src/utils/ImageMetadata.cpp
  )
  target_include_directories(image-metadata-tests PRIVATE src)
  add_test(NAME image-metadata-tests COMMAND image-metadata-tests)

  add_executable(postgres-config-tests
    tests/PostgresConfigTests.cpp
    src/config/AppConfig.cpp
    src/db/PostgresClient.cpp
  )
  target_include_directories(postgres-config-tests PRIVATE src)
  target_link_libraries(postgres-config-tests PRIVATE
    PkgConfig::PQXX
    PkgConfig::JSONCPP
  )
  add_test(NAME postgres-config-tests COMMAND postgres-config-tests)

  add_executable(api-contract-tests
    tests/ApiContractTests.cpp
  )
  target_compile_definitions(api-contract-tests PRIVATE
    ROC_SCHEMA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/schemas"
  )
  target_link_libraries(api-contract-tests PRIVATE PkgConfig::JSONCPP)
  add_test(NAME api-contract-tests COMMAND api-contract-tests)

  add_executable(invitation-code-tests
    tests/InvitationCodeTests.cpp
    src/utils/InvitationCode.cpp
  )
  target_include_directories(invitation-code-tests PRIVATE src)
  target_link_libraries(invitation-code-tests PRIVATE OpenSSL::Crypto)
  add_test(NAME invitation-code-tests COMMAND invitation-code-tests)
endif()
