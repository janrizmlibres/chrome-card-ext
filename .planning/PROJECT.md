# Slash Vault Chrome Extension — UX & Data Fixes

## What This Is

A Chrome Manifest V3 extension that autofills Slash virtual card details and addresses into web forms. Cards and addresses are managed in a React popup; autofill is triggered per-card or globally (Ctrl+Shift+F). An Express/ts-node backend proxies the Slash API and manages Supabase data.

This milestone addresses three client-reported issues: data not appearing after import, addresses not showing in the popup despite being in the database, and no way to filter which addresses pair with cards.

## Core Value

Autofill should work reliably — the right card and address fill the right fields with zero friction.

## Requirements

### Validated

- ✓ Cards importable from Slash API and displayed in popup — existing
- ✓ Addresses importable and stored in Supabase — existing
- ✓ Round-robin card+address pairing for autofill — existing
- ✓ Per-card autofill with address passthrough (`addressId`) — existing
- ✓ Admin panel with import controls — existing
- ✓ Supabase auth (signup/login) — existing
- ✓ CVV reveal on demand — existing
- ✓ Card search bar — existing

### Active

- [ ] **SYNC-01**: After address or card import completes, the popup automatically re-fetches and displays the updated data without requiring the user to close/reopen or click around
- [ ] **FILTER-01**: User can filter the address pool in the popup using a single freeform search input (no separate state/city dropdowns); a case-insensitive substring match against `city` OR `state` decides which addresses participate in round-robin pairing
- [ ] **FILTER-02**: While the search is active, each card row pairs only with addresses from the filtered pool, and the empty-pool state is visually distinguishable from "no addresses imported"
- [ ] **DEBUG-01**: "No address available" is resolved — addresses stored in Supabase appear in the popup; root cause identified and fixed through guided debugging

### Out of Scope

- Per-card sticky address assignment (one address remembered per card) — client confirmed always-pick model via filtering
- Autofill-time address modal/dropdown — filtering is the selection mechanism
- Address creation or editing in the popup — admin-only import flow is sufficient for now
- Backend auth enforcement — separate security concern, not part of this client request

## Context

**Client feedback (verbatim):** "I can import cards and addresses, but have to click around for them to sync and appear. Also, I have no way to pick the address associated with the card. Lastly, I'd like to be able to filter by state or city, etc. and then have only those show on the cards."

**Existing address flow:** `GET_ADDRESSES` message → background → `GET /api/addresses?userId=...` → Supabase. The popup only calls `fetchAddresses()` inside `useEffect([user])`, meaning it only fires on login — not after import.

**Existing pairing logic:** `activeAddresses[idx % activeAddresses.length]` — pure round-robin by card index. No FK between cards and addresses.

**"No address available" bug:** Addresses are confirmed present in the Supabase `addresses` table (verified via dashboard screenshot). The extension shows "No address available" on all cards. This is an isolated bug — not caused by import timing. Root cause unknown; needs systematic debugging of the `GET_ADDRESSES` → background → popup data path.

**Codebase map:** `.planning/codebase/` contains full architecture, stack, structure, and conventions analysis (as of 2026-05-03).

## Constraints

- **Chrome MV3**: Background service worker may be torn down at any time — no persistent in-memory state
- **Existing message protocol**: New features must use the established `chrome.runtime.sendMessage` type-discriminator pattern
- **No backend auth**: Backend trusts client-supplied `userId`/`role` — acceptable for localhost-only use
- **Tailwind + React 19**: UI additions must follow existing component patterns and Tailwind utility classes
- **No test suite**: Manual verification only; no automated test infrastructure

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Filtering drives address selection (no per-card dropdown) | Client confirmed round-robin pairing is intentional; filter is the selection mechanism | — Pending |
| "No address available" is a separate debugging task | Confirmed isolated from import sync; root cause unknown, needs investigation | — Pending |
| Address filter lives in popup UI (not auto-detected from page) | Client specified popup-based filtering | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-03 after initialization*
