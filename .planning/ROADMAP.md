# Roadmap: Slash Vault Chrome Extension — UX & Data Fixes

## Overview

Three focused improvements to the Slash Vault Chrome extension based on client feedback. Phase 1 fixes the import sync gap so the popup updates without user intervention. Phase 2 adds state/city address filtering to the popup so users control which addresses pair with cards. Phase 3 is guided debugging to find and fix why addresses present in Supabase don't appear in the extension at all.

## Phases

- [ ] **Phase 1: Import Sync** — Popup auto-refreshes cards and addresses after admin import
- [ ] **Phase 2: Address Filtering** — State/city filter in popup controls the active address pool
- [ ] **Phase 3: Address Display Debug** — Investigate and fix "No address available" root cause

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

Plans:
- [ ] 01-01: Wire AdminOptions import callbacks to parent App re-fetch (fetchCards + fetchAddresses)

### Phase 2: Address Filtering
**Goal**: Users can filter the address pool in the popup by state, then optionally by city. Only addresses matching the active filter participate in round-robin pairing; clearing the filter restores the full pool. Each card row shows the address currently paired to it.
**Depends on**: Phase 1
**Requirements**: FILTER-01, FILTER-02, FILTER-03, FILTER-04
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Selecting a state from the filter shows only addresses from that state paired with cards
  2. Selecting a city (after state) narrows to city-level addresses
  3. Clearing the filter restores full round-robin with all active addresses
  4. Each card row displays the name, city, and state of its currently paired address (or "No address available" only when the pool is genuinely empty)

Plans:
- [ ] 02-01: Add state/city cascading filter UI to the popup (above the card list or in the search area)
- [ ] 02-02: Wire filter state to `activeAddresses` computation so round-robin uses the filtered pool

### Phase 3: Address Display Debug
**Goal**: Identify and fix the root cause of "No address available" appearing on all card rows even when the Supabase `addresses` table is populated. This is an isolated debugging phase — not related to import sync.
**Depends on**: Phase 1 (so sync is not a confounding variable)
**Requirements**: DEBUG-01, DEBUG-02
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. Root cause is identified and documented (e.g., wrong userId filter, missing field in API response, background message handler gap)
  2. Addresses stored in Supabase appear correctly in the popup's active address pool
  3. Card rows show paired addresses from the pool without "No address available" (when addresses exist)

Plans:
- [ ] 03-01: Trace the GET_ADDRESSES path end-to-end (popup → background → Express → Supabase) to find where data is lost or filtered out
- [ ] 03-02: Apply fix and verify addresses appear in popup

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Import Sync | 0/1 | Not started | - |
| 2. Address Filtering | 0/2 | Not started | - |
| 3. Address Display Debug | 0/2 | Not started | - |
