# Roadmap: Slash Vault Chrome Extension — UX & Data Fixes

## Overview

Three focused improvements to the Slash Vault Chrome extension based on client feedback. Phase 1 fixes the import sync gap so the popup updates without user intervention. Phase 2 is guided debugging to find and fix why addresses present in Supabase don't appear in the extension at all — this must land before filtering can be tested. Phase 3 then adds a freeform address search to the popup so users control which addresses pair with cards.

## Phases

- [x] **Phase 1: Import Sync** — Popup auto-refreshes cards and addresses after admin import (address-only scope; 2026-05-03)
- [x] **Phase 2: Address Display Debug** — Investigate and fix "No address available" root cause (root cause: schema drift — `addresses.excluded_until` column missing in live DB; fix: SQL migration handed to user + background handler hardened; 2026-05-03)
- [ ] **Phase 3: Address Filtering** — Freeform search in popup (matches city OR state) controls the active address pool

## Phase Details

### Phase 1: Import Sync
**Goal**: After an admin completes an import (cards or addresses), the popup re-fetches and displays the new data without requiring the user to close/reopen or click elsewhere.
**Depends on**: Nothing (first phase)
**Requirements**: SYNC-01
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. Immediately after an address import completes in AdminOptions, the popup's address list updates and card pairings reflect the new addresses
  2. Immediately after a card import completes, the popup's card list updates with the new cards
  3. No manual action (popup close/reopen, tab switch, refresh click) is required by the user

**Plans:** 1 plan
Plans:
- [x] 01-01-PLAN.md — Convert addresses-import to sync 200, add isImporting spinner, wire onAddressesImported→fetchAddresses (address-only scope per D-14)

### Phase 2: Address Display Debug — *Offloaded to `/gsd-debug`*
**Goal**: Identify and fix the root cause of "No address available" appearing on all card rows even when the Supabase `addresses` table is populated.
**Depends on**: Phase 1 (so sync is not a confounding variable)
**Requirements**: DEBUG-01, DEBUG-02
**UI hint**: no
**Status**: Detail extracted out of this roadmap and isolated for handoff.
**Context bundle**: [`phases/02-address-display-debug/02-DEBUG-CONTEXT.md`](phases/02-address-display-debug/02-DEBUG-CONTEXT.md)
**Success criteria, hypotheses, touchpoints, repro steps, and expected artifacts** all live in the bundle above. Run `/gsd-debug` against that file to start work; no plan files are pre-staged here because the fix scope depends on the root cause the debug session uncovers.

### Phase 3: Address Filtering
**Goal**: Users can filter the address pool in the popup using a single freeform search field. The search string matches case-insensitively as a substring against either the address's `city` OR `state` — a hit in either field is sufficient. Only matching addresses participate in round-robin pairing; clearing the search restores the full pool. Each card row shows the address currently paired to it.
**Depends on**: Phase 2 (cannot validate filtering until address display is fixed)
**Requirements**: FILTER-01, FILTER-02, FILTER-03, FILTER-04
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Typing a string into the search input filters the active pool to addresses whose `city` OR `state` contains the string (case-insensitive substring match)
  2. Card pairings update live as the user types — round-robin reruns over the filtered pool on each keystroke
  3. Clearing the search input restores the full active pool and refreshes pairings
  4. Each card row displays the name, city, and state of its currently paired address (or "No address available" only when the filtered pool is genuinely empty)

**Plans:** 2 plans

**Wave 1**
- [ ] 03-01-PLAN.md — Add `addressSearch` useState + render second freeform search input below the card-search input in the popup header (FILTER-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 03-02-PLAN.md — Derive `filteredAddresses` from `activeAddresses` + `addressSearch`, switch round-robin pairing to `filteredAddresses`, add distinct "No address matches filter" empty-state branch (FILTER-02, FILTER-03, FILTER-04)

**Cross-cutting constraints** *(must hold across both plans)*
- Round-robin pairing invariant preserved — no per-card sticky/dropdown/picker (CLAUDE.md "Card-Address Pairing")
- Popup-only — no backend / message-type / Supabase changes (D-14)
- No persistence — `addressSearch` resets on every popup open (D-13)
- Exclusion-first — `filteredAddresses` derives from `activeAddresses`, not raw `addresses` (D-09)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Import Sync | 1/1 | Complete (human UAT pending) | 2026-05-03 |
| 2. Address Display Debug | — | Complete (see 02-DEBUG-LOG.md, 02-FIX.md; user SQL migration + UAT pending) | 2026-05-03 |
| 3. Address Filtering | 0/2 | Not started | - |
