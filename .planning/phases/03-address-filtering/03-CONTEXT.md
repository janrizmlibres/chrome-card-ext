# Phase 3: Address Filtering — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a **single freeform search input** to the popup that filters the active address pool by case-insensitive substring against `addresses.city` OR `addresses.state`. The filtered pool drives the existing round-robin pairing live (re-pairs on every keystroke). The card-row paired-address display continues to work as today; only the empty-result string changes when the cause is "filter has no matches" rather than "no addresses imported at all".

**Explicitly out of scope** (would be its own phase): per-card address dropdowns, sticky per-card assignment, address creation/editing in the popup, fuzzy matching, search across additional address fields (`name`, `street`, `zip`), filter persistence across popup sessions, multi-token search.

</domain>

<decisions>
## Implementation Decisions

### UI placement
- **D-01:** Add a second full-width search input to the existing popup header strip, **stacked directly below the existing card search** (`App.tsx:371-380`). Same `Search` icon prefix, same input styling, same horizontal padding. Costs ~52px of vertical space inside the 400×600 popup; acceptable.
- **D-02:** Placeholder copy: `"Filter addresses by city or state"`. Wording can be tuned during implementation but must explicitly say "city or state" so users understand the match scope without inspecting code.
- **D-03:** No inline "X of Y addresses" counter in v1. (Considered and rejected — adds visual noise without changing behavior. Re-evaluate if users ask for it.)

### Match semantics — single literal substring
- **D-04:** Match mirrors the existing card search behavior at `App.tsx:129-141`: `query = input.trim().toLowerCase()`, then keep address if `address.city.toLowerCase().includes(query) || address.state.toLowerCase().includes(query)`. Empty/whitespace-only query keeps every address (no filtering).
- **D-05:** **Treat the whole input as one literal substring.** No whitespace-tokenization. `"san fran"` requires the literal substring `"san fran"` to appear in city OR state. Justification: matches the user's intuition for the existing card search and is the simplest mental model. AND/OR token-splitting was considered and rejected.
- **D-06:** Match scope is **strictly `city` and `state` columns**. Do NOT extend to `name`, `street`, `zip`, or any other column without an explicit phase. (Captured as deferred.)

### Round-robin pairing — filtered pool drives pairing
- **D-07:** Introduce a derived `filteredAddresses` value computed from the existing `activeAddresses` array (`App.tsx:150-153`). Round-robin computation at `App.tsx:413-416` switches from `activeAddresses[idx % activeAddresses.length]` to `filteredAddresses[idx % filteredAddresses.length]`.
- **D-08:** `filteredAddresses` is computed inside the existing `App` render (no `useMemo` required at this scale; popup re-renders are cheap and the address list is small). Planner may add memoization if profiling shows it matters.
- **D-09:** The `activeAddresses` filter (excluded_until check) runs FIRST, then the search filter on top. A search match against an excluded address still excludes it — exclusion always wins.

### Empty-result behavior
- **D-10:** When `filteredAddresses.length === 0` AND `activeAddresses.length > 0` AND the search query is non-empty → each card row shows a **distinct message**, e.g. `"No address matches filter"`. (Exact copy is Claude's discretion during planning.)
- **D-11:** When `activeAddresses.length === 0` (genuinely no addresses imported, regardless of search query) → continue to show `"No address available"` exactly as today (`App.tsx:474-475`). The two empty cases must be visually distinguishable so users know whether to clear the filter or import addresses.
- **D-12:** No input-side hint, no auto-fallback to the full pool, no warning banner. Keep the surface small.

### Persistence — none
- **D-13:** Address-search state lives in a single `useState<string>` in `App.tsx`, exactly mirroring the existing `searchQuery` for the card search. **Resets to empty on every popup open.** No `chrome.storage.local`, no background SW cache. Matches the card search's behavior — consistency over recall.

### Backend / data flow — no changes
- **D-14:** Phase 3 is **popup-only**. No new background message types, no Express route changes, no Supabase changes. The existing `GET_ADDRESSES` flow (Phase 2's hardened version) feeds `addresses` into `App.tsx` and that is sufficient.

### Claude's Discretion
- Exact placeholder copy for the search input (D-02 says it must mention "city or state"; precise wording is open).
- Exact copy for the per-card "no filter match" message (D-10).
- Whether to wrap `filteredAddresses` in `useMemo` (D-08).
- Whether the new input variable is named `addressSearch`, `addressFilter`, `addressQuery`, etc. — pick what reads best alongside `searchQuery`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — FILTER-01..04 requirements (after this commit, updated to match the freeform-search semantics)
- `.planning/REQUIREMENTS.md` §"Address Filtering" — FILTER-01..04 (revised 2026-05-03 in the `revise-phase3-freeform-search` quick task)
- `.planning/ROADMAP.md` §"Phase 3: Address Filtering" — goal, success criteria, plans 03-01 / 03-02
- `.planning/STATE.md` §"Decisions" (entry "Phase 3 (Discuss, 2026-05-03)") — locked decision record matching this CONTEXT.md
- `CLAUDE.md` §"Card-Address Pairing" — confirms the pure-round-robin model; new code MUST preserve this (no per-card sticky assignment)
- `CLAUDE.md` §"Address data flow" — message wiring; no changes needed in this phase

### Codebase maps
- `.planning/codebase/STRUCTURE.md` §"src/popup/" — confirms `App.tsx` is the only popup entry; no new component needed
- `.planning/codebase/CONVENTIONS.md` — Tailwind palette, naming (`isImporting`-style booleans), message-type rules (none triggered here)

### Touchpoints (to be modified)
- `src/popup/App.tsx:22` — existing `searchQuery` state declaration; add a sibling `addressSearch` state
- `src/popup/App.tsx:129-141` — existing `filteredCards` computation; mirror its shape for `filteredAddresses`
- `src/popup/App.tsx:150-153` — existing `activeAddresses`; the new `filteredAddresses` derives from this
- `src/popup/App.tsx:155` — `hasAutofillCandidates` may need to consider `filteredAddresses` instead of `activeAddresses` (planner decides)
- `src/popup/App.tsx:371-380` — existing card-search header block; add the second input directly below
- `src/popup/App.tsx:413-416` — `pairedAddress = activeAddresses[idx % activeAddresses.length]`; switch to `filteredAddresses`
- `src/popup/App.tsx:469-475` — paired-address render block; add the distinct "no filter match" branch (D-10/D-11)

### Patterns to mirror (do NOT modify)
- `src/popup/App.tsx:22` (`searchQuery` useState) and `:129-141` (filter computation) and `:374-379` (input render with `Search` icon) — these are the canonical examples; the address search MUST mirror their shape and styling.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Search` icon from `lucide-react` already imported (`App.tsx:2`) — reuse for the new input's prefix icon.
- `searchQuery` filter style — `query = input.trim().toLowerCase()` then `field.toLowerCase().includes(query)` is already the convention. No new utilities needed.
- `activeAddresses` filter (`App.tsx:150-153`) is the input pool for the new derived `filteredAddresses` — do not duplicate the `excluded_until` logic.

### Established Patterns
- **Dual-pass filtering**: card list already filters by `excluded_until` for `activeCards` and by `searchQuery` for `filteredCards`. Address list mirrors this: `activeAddresses` (excluded filter) → `filteredAddresses` (search filter).
- **Header layout**: `App.tsx:371-380` uses a flex container with the search input and an action button. The new address input becomes the second row in this same header strip.
- **Empty-state copy**: existing `"No address available"` lives in the per-card render block. Adding a sibling `"No address matches filter"` branch keeps all empty-state copy local to that block.

### Integration Points
- **No new chrome.runtime message types.** All work is render-time in `App.tsx`.
- **No new Express routes.** Backend already returns the full active address pool.
- **No new Supabase columns.** `city` and `state` already exist on `addresses`.

</code_context>

<specifics>
## Specific Ideas

- User explicitly said "the search should be freeform string (single field), not city/state dropdowns. it matches both" — captured in the just-completed `revise-phase3-freeform-search` quick task and reflected in the revised ROADMAP/REQUIREMENTS that this discussion locks in as implementation decisions.
- User chose to mirror the existing card-search shape verbatim (literal substring, no persistence) — favoring consistency with the rest of the popup over richer filter semantics.

</specifics>

<deferred>
## Deferred Ideas

- **Inline "X of Y addresses" match counter** under or beside the search input — rejected for v1 (D-03). Revisit if users ask for it.
- **Multi-token AND/OR matching** (`"san francisco ca"` etc.) — rejected for v1 (D-05). Revisit if users find single-substring matching too rigid.
- **Match scope expansion to `name` / `street` / `zip`** — rejected for v1 (D-06). Would require a new phase if requested.
- **Filter persistence across popup sessions** (chrome.storage.local) — rejected for v1 (D-13). Card search also doesn't persist; revisit only if both should change together.
- **Auto-fallback to full pool when filter matches zero** — rejected (D-12). The distinct empty-state message is sufficient signal that the filter, not the data, is the cause.
- **Per-card sticky address assignment** — already deferred to v2 (PROJECT.md ADR-01); unchanged.
- **Per-card address dropdown at autofill time** — already explicitly out of scope (REQUIREMENTS.md "Out of Scope"); unchanged.

</deferred>

---

*Phase: 3-Address Filtering*
*Context gathered: 2026-05-03*
