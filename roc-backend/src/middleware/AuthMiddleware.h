#pragma once

#include <drogon/drogon.h>

namespace roc::middleware {

class AuthFilter : public drogon::HttpFilter<AuthFilter> {
 public:
  AuthFilter() {}

  void doFilter(const drogon::HttpRequestPtr &req,
                drogon::FilterCallback &&fcb,
                drogon::FilterChainCallback &&fccb) override;
};

class SuperAdminFilter : public drogon::HttpFilter<SuperAdminFilter> {
 public:
  SuperAdminFilter() {}

  void doFilter(const drogon::HttpRequestPtr &req,
                drogon::FilterCallback &&fcb,
                drogon::FilterChainCallback &&fccb) override;
};

}  // namespace roc::middleware
