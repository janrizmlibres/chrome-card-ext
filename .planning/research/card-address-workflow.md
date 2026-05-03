# Card and Address Workflow Research

**Date:** 2026-05-03  
**Source:** Local codebase inspection

## Current Behavior

Cards come from the Slash API and are mapped into the app `Card` shape in `server/index.ts`. Addresses live in Supabase and are fetched through `/api/addresses`. The popup loads both collections after authentication, but it does not persist a relationship between them.

In the card list, the displayed address is selected by the card's list index modulo active address count. That makes the pairing unstable when cards or addresses are added, removed, filtered, or re-sorted.

Address import accepts a request, sanitizes rows, returns `202 Accepted`, then inserts rows in 500-record chunks after the HTTP response. The client receives only "Accepted for background import", so it has no completion signal.

## Key Implementation Implications

- Filtering cards by city/state requires a stable card-to-address relationship first.
- A client-only association map would not survive across devices or users, so persistence should be backend-backed.
- If the association is stored in Slash card `userData`, it aligns with existing card metadata patterns but may be shared across all users who can see the card.
- If the association is stored in Supabase, per-user or per-group behavior can be modeled explicitly.
- The import visibility issue is independent and can be solved before the association model.

## Existing Surfaces to Reuse

- `Address` type in `src/lib/types.ts`.
- `GET_ADDRESSES` and `AUTOFILL_CARD` background messages.
- `/api/addresses` and `/api/addresses/:id` backend routes.
- `mark_used` support for `addressId`.

## Risks

- Storing association in Slash `userData` may race with existing usage-count updates, which also patch `userData`.
- Adding a Supabase table requires schema migration and authorization thinking.
- Popup real estate is limited, so address selection controls need to be compact.
- Import status tracking can become overbuilt; the first implementation should match realistic import sizes.
