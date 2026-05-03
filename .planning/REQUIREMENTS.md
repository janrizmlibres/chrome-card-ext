# Requirements: Slash Vault Chrome Extension — UX & Data Fixes

**Defined:** 2026-05-03
**Core Value:** Autofill should work reliably — the right card and address fill the right fields with zero friction.

## v1 Requirements

### Sync

- [ ] **SYNC-01**: After an admin imports addresses or cards, the popup re-fetches and displays the updated data automatically — no close/reopen or other action required

### Address Filtering

- [ ] **FILTER-01**: User can filter the address pool in the popup by state; only addresses from the selected state participate in round-robin pairing with cards
- [ ] **FILTER-02**: After selecting a state, user can optionally narrow by city within that state
- [ ] **FILTER-03**: Clearing the filter restores the full active address pool and updates card pairings accordingly
- [ ] **FILTER-04**: Each card row displays the address currently paired to it based on the active filter

### Debug

- [ ] **DEBUG-01**: Root cause of "No address available" identified — addresses present in Supabase `addresses` table do not appear in the extension popup
- [ ] **DEBUG-02**: Bug resolved — addresses stored in Supabase are fetched and displayed correctly in the popup

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
| SYNC-01 | — | Pending |
| FILTER-01 | — | Pending |
| FILTER-02 | — | Pending |
| FILTER-03 | — | Pending |
| FILTER-04 | — | Pending |
| DEBUG-01 | — | Pending |
| DEBUG-02 | — | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 7 ⚠️

---
*Requirements defined: 2026-05-03*
*Last updated: 2026-05-03 after initial definition*
