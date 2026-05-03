# Project Context

**Project:** Slash Vault Chrome Card Extension  
**Initialized:** 2026-05-03  
**Mode:** Existing codebase, client-driven improvement project

## Client Brief

The client can import cards and addresses, but imported data does not reliably appear until they click around. They also cannot choose which address belongs with a card. They want to filter by address geography, such as state or city, and have only the matching cards show in the vault.

## Current Product

Slash Vault is a Chrome Manifest V3 extension for managing Slash virtual cards and autofilling checkout forms. The popup UI lists cards, generates cards, shows selected card metadata, and triggers autofill. The backend is an Express server that proxies Slash card APIs and stores addresses, selector profiles, network profiles, settings, and audit logs in Supabase.

The codebase already supports:
- Card creation and list retrieval from Slash via `server/index.ts`.
- Address import and retrieval through Supabase-backed `/api/addresses` routes.
- Popup-side card and address state in `src/popup/App.tsx`.
- Autofill using a selected card plus an optional address through background/content-script messaging.
- Address selector mapping for address fields.

## Problem Statement

Cards and addresses exist as separate collections, but the product experience implies a relationship between them. Today the popup pairs a card with an address by list position, so the user cannot intentionally associate a specific address with a specific card. Address import is accepted asynchronously with no import job status or post-import refresh path, causing stale UI until the user reopens or clicks around. Filtering is card-text-only, so imported address geography cannot be used to decide which cards are visible or autofillable.

## Desired Outcome

Users should see imported cards and addresses appear without manual navigation tricks, choose the address associated with each card, and filter the vault by address fields such as state, city, name, or ZIP. When a location filter is active, only cards whose selected/associated address matches should remain visible and available for card-level autofill from the vault.

## Users

- **Admin users:** Import addresses, configure selectors/network profiles/settings, and need confidence that imports completed.
- **Regular users:** Use available cards and addresses for autofill, and need a predictable way to pick the right billing/shipping address for each card.

## Current Architecture Notes

- Popup: [src/popup/App.tsx](/Users/janlibs/dev/chrome-card-ext/src/popup/App.tsx)
- Background service worker: [src/background/index.ts](/Users/janlibs/dev/chrome-card-ext/src/background/index.ts)
- Content script autofill: [src/content/index.ts](/Users/janlibs/dev/chrome-card-ext/src/content/index.ts)
- Backend API: [server/index.ts](/Users/janlibs/dev/chrome-card-ext/server/index.ts)
- Shared types: [src/lib/types.ts](/Users/janlibs/dev/chrome-card-ext/src/lib/types.ts)
- Schema: [schema.sql](/Users/janlibs/dev/chrome-card-ext/schema.sql)

## Product Assumptions

- The "address associated with the card" means a user-selectable default address for a card in the extension UI, not a Slash-side billing-address feature.
- The association can be stored in app-owned metadata, either in Slash card `userData` or a Supabase join table, depending on implementation risk.
- Filtering by state/city should filter cards by their associated address. Cards without an associated address should be hidden while address filters are active unless the UI explicitly includes an "unassigned" option.
- The first milestone should preserve current card generation and autofill behavior while making address behavior intentional.

## Non-Goals

- Replacing Slash as the card source of truth.
- Reworking authentication or deployment security.
- Building a full address book management app beyond the controls needed for import, selection, and filtering.
- Changing content-script selector mapping unless required for address autofill correctness.

## Success Criteria

- After address import completes, the popup can refresh or otherwise update without requiring arbitrary clicking.
- Each visible card can show and edit its associated address.
- The card list can be filtered by address city and state.
- Card-level autofill uses the selected address for that card.
- Existing build still passes with `npm run build`.
