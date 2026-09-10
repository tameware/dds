---
capability: transposition-table
owners: [trans_table]
last-updated: 2026-09-08
---

# Transposition Table

> **Specs vs. doxygen.** The `TransTable` interface, `NodeCards` layout, and each
> method's contract are documented inline in `trans_table.hpp`. This spec records
> the capability-wide facts: the three implementations, the memory/reset model, and
> how the table relates to the owning context.

## Purpose

The transposition table caches double-dummy search results (bounds, best move,
and move-ordering hints for a position) so the alpha-beta search avoids
re-solving positions it has already seen. It is the single biggest memory
consumer in a solve and the main reason reusing a [solver-context](solver-context.md) across
solves is worthwhile. This capability provides the abstract table interface and
its three concrete strategies, trading memory against speed.

## Behaviour & invariants

> Per-method signatures live in the header doxygen; these are the whole-table
> guarantees.

- **One interface, three implementations.** `TransTable` is an abstract base.
  `TransTableP` (pattern, the default) keys a position by its suit-length shape
  and stores, under each shape, the *relative-rank patterns* that decided the
  result (the cards at or above the lowest winning rank per suit, by owner), an
  approach taken from macroxue's bridge-solver. A shape holds any number of
  patterns, ordered most general first and bucketed by the owner of the first
  relevant suit's top card, so a lookup scans only the buckets it can match.
  `TransTableL` (large) is the paged-memory table with harvesting and a fixed
  per-shape entry capacity; `TransTableS` (small) is the pool-based, lower-memory,
  somewhat slower table. Which one a context uses is chosen by
  `TTKind::{Pattern,Large,Small}` in `SolverConfig` (default `Pattern`) — see
  [solver-context](solver-context.md). The env var `DDS_TT_KIND`
  (`small|large|pattern`) overrides the configured kind.
- **Pattern vs. Large.** On random deals the two are at parity; on void-heavy
  ("freak") deals and under tight memory limits Pattern is markedly faster,
  because Large's fixed per-shape blocks overflow and its lookups degrade to
  long linear scans, while Pattern's unbounded per-shape lists and generic-first
  ordering keep lookups short. Both produce identical results.
- **Not thread-safe.** A table instance must be accessed from a single solver
  thread. Concurrency comes from one table per context/worker, never a shared
  table under a lock.
- **`NodeCards` is a tightly packed 8-byte record** (upper/lower trick bounds,
  best-move suit/rank, per-suit `least_win` encoding). The compactness is
  deliberate — it caps the per-entry footprint of large tables. A pointer
  returned by `lookup()` is valid only until the next `add()` or reset.
- **Memory limits differ by implementation.** On `TransTableL`,
  `set_memory_default` is a soft limit (may briefly exceed, triggering
  cleanup/harvesting) and `set_memory_maximum` is a hard cap. On `TransTableS`,
  `set_memory_default` is a **no-op**; only `set_memory_maximum` is enforced.
  `TransTableP` likewise enforces only the maximum (the default merely floors
  it): it grows on demand and, when the next allocation would exceed the
  maximum, clears the whole table (`ResetReason::MemoryExhausted`) and refills
  rather than harvesting. The maximum is a hard cap that applies at once:
  `set_memory_maximum` on a live table already above the new limit clears it
  immediately rather than waiting for the next allocation.
  The header documents `0` as "unlimited" for the default limit, but `TransTableL`
  does not implement it that way — `set_memory_default(0)` yields
  `pages_default_ == 0`, and the next `reset_memory` then frees *every* pooled
  page. Treat `0` as unsupported rather than unlimited. It does not arise on the
  production path: the owning [solver-context](solver-context.md) replaces `<= 0`
  config values with `THREADMEM_*` constants before construct. (Reconciling the
  header's doxygen is out of scope here.) Env overrides: `DDS_TT_DEFAULT_MB` /
  `DDS_TT_LIMIT_MB`.
- **Resets are reason-tagged and tiered.** `reset_memory(ResetReason)` clears
  cached positions and bumps the per-reason reset counters — it does **not** clear
  statistics, which accumulate across resets by design — but retains the allocated
  structures for reuse;
  `return_all_memory()` deallocates everything and the table **must** be
  re-created with `make_tt()` before further use — `init()` does not reallocate.
  `TransTableP` refines the "retains structures" rule by reason: an ordinary
  reset returns its pattern blocks to a per-size-class pool for reuse, whereas a
  `MemoryExhausted` reset (including the one triggered by lowering the maximum)
  also frees the pooled blocks, since the table is by definition over budget.
  `ResetReason` (`TooManyNodes`, `NewDeal`,
  `NewTrump`, `MemoryExhausted`, `FreeMemory`, …) records *why* a reset happened,
  accumulating a per-reason histogram for diagnostics. `TransTableL` keeps its
  reset/calloc counters unconditionally; `TransTableS`'s are compiled in only
  under `DDS_TT_STATS`.
- **Allocation failures throw `std::bad_alloc`** (post-modernization); non-critical
  allocations may fall back rather than throw.
- **Lifecycle on the production context path:** first TT access does
  `set_memory_*` → `make_tt()`; per-deal `init(hand_lookup)` runs later in
  `init.cpp` before search. Standalone/header examples may show `init` first —
  that is not what `SearchContext::trans_table()` does.
- **Build-flag-gated diagnostics.** `tt_reset_debug` (`DDS_DEBUG_TT_RESET`) enables
  reset-tracking diagnostics in `TransTableL` (wired through [build-system](build-system.md), off
  by default). TT ownership itself is not build-flag-gated — it is always
  instance-scoped via `SearchContext`.
- **`testable_trans_table`** is the same sources exposed to
  `//library/tests/trans_table/...` for white-box testing; behaviour is identical to
  `trans_table`.

## Key entry points

- `library/src/trans_table/trans_table.hpp` — `TransTable` abstract interface,
  `NodeCards`, `ResetReason`. Doxygen documents every method.
- `library/src/trans_table/trans_table_p.{hpp,cpp}` — `TransTableP` (pattern, default).
- `library/src/trans_table/trans_table_l.{hpp,cpp}` — `TransTableL` (large/paged).
- `library/src/trans_table/trans_table_s.{hpp,cpp}` — `TransTableS` (small/pool).
- Build targets: `//library/src/trans_table:{trans_table,testable_trans_table}`.
- Guarded by `//library/tests/trans_table/...` and, for context wiring,
  `//library/tests/system:{tt_sharing_test,configure_tt_api_test}`.

## Known gaps / non-goals

- No cross-thread or cross-process sharing of a table; in-memory, single-thread
  only.
- The table does not choose its own size strategy — kind and limits are dictated
  by the owning [solver-context](solver-context.md) / config, not decided internally.
- Print/diagnostic methods are for offline analysis and emit only under the
  relevant debug builds; they are not part of the hot path.
