# Requirements: Slash Vault Chrome Extension — UX & Data Fixes

**Defined:** 2026-05-03
**Core Value:** Autofill should work reliably — the right card and address fill the right fields with zero friction.

## v1 Requirements

### Sync

- [ ] **SYNC-01**: After an admin imports addresses or cards, the popup re-fetches and displays the updated data automatically — no close/reopen or other action required

### Address Filtering

- [ ] **FILTER-01**: User can filter the address pool in the popup using a single freeform search input (no separate state/city dropdowns)
- [ ] **FILTER-02**: The search string is matched as a case-insensitive substring against each address's `city` OR `state`; a match in either field includes the address in the active pool
- [ ] **FILTER-03**: Clearing the search input restores the full active address pool and updates card pairings accordingly
- [ ] **FILTER-04**: Each card row displays the address currently paired to it based on the active (filtered) pool

### Debug

- [x] **DEBUG-01**: Root cause of "No address available" identified — addresses present in Supabase `addresses` table do not appear in the extension popup
- [x] **DEBUG-02**: Bug resolved — addresses stored in Supabase are fetched and displayed correctly in the popup

## v2 Requirements

### Address Management

- **ADDR-01**: Per-card sticky address assignment (one address remembered across sessions)
- **ADDR-02**: Address creation or editing from within the popup
- **ADDR-03**: Address usage count resets or archival

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-card address dropdown at autofill time | Client confirmed filtering is the selection mechanism |
| Auto-detecting site location to pre-select address | Not requested; filtering is manual |
| Backend authentication enforcement | Separate security concern outside this engagement |
| Automated test suite | No testing infrastructure exists; out of scope for this milestone |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SYNC-01 | Phase 1 | Complete (UAT pending) |
| DEBUG-01 | Phase 2 (resolved via `/gsd-debug`) | Complete (2026-05-03; pending user SQL migration + UAT) |
| DEBUG-02 | Phase 2 (resolved via `/gsd-debug`) | Complete (2026-05-03; pending user SQL migration + UAT) |
| FILTER-01 | Phase 3 | Pending |
| FILTER-02 | Phase 3 | Pending |
| FILTER-03 | Phase 3 | Pending |
| FILTER-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-03*
*Last updated: 2026-05-03 after initial definition*
