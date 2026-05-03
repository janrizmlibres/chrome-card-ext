# Phase 3: Address Filtering — Discussion Log

**Discussed:** 2026-05-03
**Mode:** default (4 single-question turns; no flags)
**Reference:** `03-CONTEXT.md` is the canonical decision record. This log is for human audit only.

## Areas Selected

User opted to discuss all four offered gray areas: UI placement, empty-result behavior, filter persistence, multi-token matching.

## Q1 — UI placement

**Options presented:**
1. Stacked directly below the card search (full-width, ~52px vertical)
2. Side-by-side with the card search (two narrower inputs)
3. Collapsible filter panel (toggle to expand)
4. Stacked below + inline "X of Y addresses" counter

**User selected:** 1 — Stacked directly below the card search.
**Captured as:** D-01, D-02, D-03.

## Q2 — Empty-result behavior

**Options presented:**
1. Reuse existing "No address available" on every card row
2. Distinct per-card message ("No address matches filter")
3. Distinct per-card message + subtle hint under the search input
4. Auto-fallback to the full pool with a warning

**User selected:** 2 — Distinct per-card message; no input-side hint, no auto-fallback.
**Captured as:** D-10, D-11, D-12.

## Q3 — Filter persistence

**Options presented:**
1. No persistence — reset on every popup open (matches existing card search)
2. Persist per user via chrome.storage.local
3. Session-only via background SW in-memory state (best-effort, MV3-unreliable)

**User selected:** 1 — No persistence; mirror the card search.
**Captured as:** D-13.

## Q4 — Multi-token matching

**Options presented:**
1. One literal substring (mirror existing card search)
2. Split on whitespace, AND-match each token
3. Split on whitespace, OR-match each token

**User selected:** 1 — Single literal substring, `trim().toLowerCase().includes(...)`.
**Captured as:** D-04, D-05.

## Claude's Discretion (left to planner/implementer)

- Exact placeholder copy (must mention "city or state" — D-02).
- Exact "no filter match" message wording (D-10).
- `useMemo` for `filteredAddresses` (D-08).
- Variable naming for the new state (D-13 reasoning).

## Deferred

- Inline match counter
- Multi-token AND/OR matching
- Match scope expansion to `name` / `street` / `zip`
- Filter persistence across sessions
- Auto-fallback when filter matches zero

## Scope-Creep Watches (none triggered)

User stayed within the freeform-search scope; no new capabilities surfaced during the discussion.

---

*Discussion log: 2026-05-03*
