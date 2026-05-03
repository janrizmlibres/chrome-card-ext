# Roadmap

## Phase 1. Stabilize Address Import Feedback

**Goal:** Imported addresses become visible and trustworthy without click-around workarounds.

**Deliverables:**
- Add import completion tracking or a deterministic post-import refresh path.
- Update admin import UI to show accepted/completed/failed state.
- Refresh popup address data when import completes or when the vault regains focus.
- Preserve existing import format parsing.

**Validation:**
- Import addresses and confirm the address count/list updates without switching tabs.
- Verify failed/partial imports surface useful status.
- Run `npm run build`.

## Phase 2. Persist Card Address Association

**Goal:** Users can choose the address associated with each card, and that choice survives reloads.

**Deliverables:**
- Choose storage model for card-address association.
- Extend shared types/API responses with associated address metadata.
- Add backend routes or card metadata updates to save and fetch associations.
- Replace popup round-robin pairing with persisted selected addresses.
- Ensure `AUTOFILL_CARD` passes the selected address.

**Validation:**
- Select an address for a card, reopen popup, and confirm persistence.
- Autofill a selected card and confirm the associated address is used.
- Confirm card-only autofill still works with no address selected.
- Run `npm run build`.

## Phase 3. Add City/State Filtering

**Goal:** Location filters control which cards are visible and autofillable from the vault.

**Deliverables:**
- Add compact state and city filter controls to the vault.
- Derive filter options from imported/active associated addresses.
- Compose location filters with existing text search.
- Show clear empty and clear-filter states.

**Validation:**
- Filter by state and city and verify only cards with matching associated addresses appear.
- Confirm filters update correctly when a card's address changes.
- Confirm unfiltered search behavior remains intact.
- Run `npm run build`.

## Phase 4. UAT and Edge-Case Hardening

**Goal:** Make the full card/address workflow reliable enough for daily use.

**Deliverables:**
- Manual UAT checklist for import, association, filtering, and autofill.
- Edge-case handling for deleted addresses, inactive/excluded addresses, empty import files, duplicate IDs, and no-match filters.
- Documentation updates for user-facing workflow.

**Validation:**
- Complete UAT checklist.
- Confirm no regression in card creation, card list loading, admin options, and selector mapping.
- Run `npm run build`.

## Recommended Next Command

Run `/gsd-plan-phase 1` to produce an executable implementation plan for address import feedback and refresh behavior.
