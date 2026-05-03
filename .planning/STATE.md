# Project State

**Created:** 2026-05-03  
**Current Phase:** Ready to plan Phase 1  
**Last Command:** `/gsd-new-project`

## Active Client Need

Fix the card/address workflow so imported cards and addresses appear reliably, users can pick which address goes with each card, and city/state filters show only cards tied to matching addresses.

## Current Code Facts

- `src/popup/App.tsx` keeps separate `cards` and `addresses` arrays.
- Card search currently checks card fields only.
- Card rendering currently pairs addresses by index: `activeAddresses[idx % activeAddresses.length]`.
- `handleAutofillCard` can already pass an optional address ID.
- `src/background/index.ts` fetches addresses and cards separately.
- `server/index.ts` address import returns `202 Accepted` and finishes inserts in a background async function.
- `/api/addresses` supports `activeOnly=true` but not import job status or city/state filtering.

## Planning Artifacts

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/config.json`
- Existing codebase maps remain in `.planning/codebase/`.

## Decisions

- Treat this as an existing-codebase improvement project, not a greenfield rewrite.
- Preserve current extension message-passing architecture for initial phases.
- Address association should become explicit and persisted before location filtering is considered complete.

## Open Questions

- Should address association be per user or shared across the group/card?
- Should cards without an address remain visible under a state/city filter through an "unassigned" option?
- Should import completion be implemented as a job-status endpoint or as a synchronous import for typical batch sizes?

## Next Step

Plan Phase 1 with `/gsd-plan-phase 1`.
