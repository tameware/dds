/// @file configure_tt_api_test.cpp
/// @brief Tests for transposition table configuration API.
///
/// Validates SolverContext configure_tt() behavior for resizing,
/// switching kinds, and lazy initialization of transposition tables.

#include <cstdlib>

#include <gtest/gtest.h>

#include <solver_context/solver_context.hpp>
#include <trans_table/trans_table_l.hpp>
#include <trans_table/trans_table_p.hpp>
#include <trans_table/trans_table_s.hpp>

namespace {

struct ScopedEnv
{
  ScopedEnv(const char* name, const char* value) : name_(name)
  {
    setenv(name, value, 1);
  }
  ~ScopedEnv()
  {
    unsetenv(name_);
  }
  const char* name_;
};

auto kind_of(const TransTable* tt) -> TTKind
{
  if (dynamic_cast<const TransTableS*>(tt) != nullptr) return TTKind::Small;
  if (dynamic_cast<const TransTableP*>(tt) != nullptr) return TTKind::Pattern;
  return TTKind::Large;
}

TEST(ConfigureTtApiTest, DefaultConfigurationUsesThePatternTable)
{
  // Arrange: no explicit kind anywhere (and no environment override).
  unsetenv("DDS_TT_KIND");
  SolverConfig cfg;
  SolverContext configured(cfg);
  SolverContext bare;

  // Act & Assert
  EXPECT_EQ(cfg.tt_kind_, TTKind::Pattern);
  EXPECT_NE(nullptr, dynamic_cast<TransTableP*>(configured.trans_table()));
  EXPECT_NE(nullptr, dynamic_cast<TransTableP*>(bare.trans_table()));
}

TEST(ConfigureTtApiTest, PatternKindCreatesPatternTable)
{
  // Arrange
  SolverConfig cfg;
  cfg.tt_kind_ = TTKind::Pattern;
  SolverContext ctx(cfg);

  // Act
  auto* tt = ctx.trans_table();

  // Assert
  ASSERT_NE(tt, nullptr);
  EXPECT_NE(nullptr, dynamic_cast<TransTableP*>(tt));
}

TEST(ConfigureTtApiTest, SwitchingToPatternRecreatesAndResizingKeepsInstance)
{
  // Arrange: start from the Large table.
  SolverConfig cfg;
  cfg.tt_kind_ = TTKind::Large;
  SolverContext ctx(cfg);
  auto* large = ctx.trans_table();
  ASSERT_NE(nullptr, dynamic_cast<TransTableL*>(large));

  // Act
  ctx.configure_tt(TTKind::Pattern, /*defMB=*/8, /*maxMB=*/16);
  auto* pattern = ctx.maybe_trans_table();
  ctx.configure_tt(TTKind::Pattern, /*defMB=*/16, /*maxMB=*/32);
  auto* resized = ctx.maybe_trans_table();

  // Assert
  ASSERT_NE(pattern, nullptr);
  EXPECT_NE(nullptr, dynamic_cast<TransTableP*>(pattern));
  EXPECT_EQ(pattern, resized) << "same kind: resize in place";
  ctx.configure_tt(TTKind::Large, 8, 16);
  EXPECT_NE(nullptr, dynamic_cast<TransTableL*>(ctx.maybe_trans_table()));
}

TEST(ConfigureTtApiTest, EnvironmentOverridesTableKind)
{
  // Arrange
  ScopedEnv env("DDS_TT_KIND", "pattern");
  SolverConfig cfg;
  cfg.tt_kind_ = TTKind::Small;
  SolverContext ctx(cfg);

  // Act & Assert
  EXPECT_NE(nullptr, dynamic_cast<TransTableP*>(ctx.trans_table()));
  ScopedEnv env2("DDS_TT_KIND", "large");
  ctx.dispose_trans_table();
  EXPECT_NE(nullptr, dynamic_cast<TransTableL*>(ctx.trans_table()));
}

TEST(ConfigureTtApiTest, SwitchKindRecreatesTable)
{
  // Default context (whatever kind that is, env overrides included).
  SolverContext ctx;
  auto* tt1 = ctx.trans_table();
  ASSERT_NE(tt1, nullptr);

  // Flip to a different kind
  const TTKind new_kind = kind_of(tt1) == TTKind::Small ? TTKind::Large : TTKind::Small;
  ctx.configure_tt(new_kind, /*defMB=*/8, /*maxMB=*/8);

  auto* tt2 = ctx.maybe_trans_table();
  ASSERT_NE(tt2, nullptr);
  EXPECT_EQ(kind_of(tt2), new_kind);
}

TEST(ConfigureTtApiTest, ResizeInPlaceWhenKindUnchanged)
{
  SolverContext ctx;
  auto* tt1 = ctx.trans_table();
  ASSERT_NE(tt1, nullptr);
  const TTKind same_kind = kind_of(tt1);

  // Resize should not replace the instance when kind does not change
  ctx.configure_tt(same_kind, /*defMB=*/16, /*maxMB=*/32);
  auto* tt2 = ctx.maybe_trans_table();
  ASSERT_NE(tt2, nullptr);
  EXPECT_EQ(tt1, tt2) << "Resize should keep the same TT instance";
}

} // namespace
