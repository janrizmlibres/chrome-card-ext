# Requirements

## Scope

This project improves the existing card/address workflow in the Slash Vault extension. It focuses on data freshness after imports, explicit card-address association, and location-aware card filtering.

## Functional Requirements

### R1. Import Visibility and Sync

- The admin address import flow must expose whether an import was accepted, completed, partially completed, or failed.
- The popup must have a reliable way to refresh cards and addresses after import or when the user returns to the vault.
- The UI must avoid making users switch tabs or click unrelated controls to see newly imported addresses.
- The implementation must handle the current backend behavior where `/api/addresses/import` returns `202 Accepted` before chunk inserts finish.

### R2. Address Selection for Cards

- Each card in the vault must display its currently associated address when one exists.
- A user must be able to choose or change the address used with a specific card.
- The chosen address must persist across popup closes, extension reloads, and backend restarts.
- The card-level Autofill action must send the selected address for that card instead of using the current round-robin pairing.
- Cards without an associated address must remain usable for card-only autofill.

### R3. Location Filtering

- The vault must support filtering cards by associated address fields, at minimum `state` and `city`.
- Filtering must be based on normalized address values so common casing differences do not break matches.
- When a city/state filter is active, only cards associated with matching addresses should appear.
- Search and location filters must compose predictably.
- The active filter state should be visible and easy to clear.

### R4. Address Data Handling

- Address records must remain reusable across cards.
- Imported addresses must be deduplicated or upserted consistently using the existing external/imported ID.
- Address data used for filters must include at least `id`, `name`, `city`, `state`, `zip`, `phone`, and address lines.
- Address cooldown/exclusion behavior must remain respected for autofill candidate selection.

### R5. Autofill Behavior

- `AUTOFILL_CARD` must use the card's selected address when one is provided.
- `AUTOFILL_NEXT` must continue to work with active cards and addresses; changes should not regress existing card candidate matching.
- Usage tracking must mark the actual card and address that were filled.

## Non-Functional Requirements

- Keep changes consistent with current React state and Chrome message patterns.
- Prefer existing backend route style before extracting new router modules.
- Avoid introducing a new global client state library.
- Keep sensitive card fields (`pan`, `cvv`) available only through the existing full-card path.
- Maintain TypeScript type coverage for any new card-address fields.

## Data Requirements

The implementation needs a persistent way to represent card-address association. Candidate approaches:

- Add `default_address_id` or `address_id` to app-owned Slash card `userData`.
- Add a Supabase table such as `card_address_preferences(card_id text primary key, address_id uuid references addresses(id), user_id uuid references users(id), updated_at timestamptz)`.

The planning preference is a Supabase table if per-user association matters, and Slash `userData` if the association should travel with shared card metadata.

## UX Requirements

- The card list should not hide all context behind hover-only controls; address selection must be discoverable in a popup-sized UI.
- Address filters should use compact controls appropriate for the extension popup.
- The empty state for active filters should explain that no cards match the selected address filters.
- Loading/refreshing should communicate progress without blocking unrelated interactions longer than necessary.

## Acceptance Criteria

- Import a batch of addresses as an admin and observe completion or refresh without navigating away arbitrarily.
- Pick an address for a card, close and reopen the popup, and see the same address still attached.
- Filter by a known state and see only cards associated with addresses in that state.
- Filter by a known city and see only cards associated with addresses in that city.
- Click Autofill on a card with a selected address and verify both card and address fields are filled when selectors exist.
- Run `npm run build` successfully.
