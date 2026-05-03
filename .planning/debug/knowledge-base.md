# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## address-display-empty — popup renders "No address available" for every card row despite Supabase having addresses
- **Date:** 2026-05-03
- **Error patterns:** No address available, addresses, excluded_until, column does not exist, activeOnly, GET /api/addresses, setAddresses, Array.isArray, PostgREST, schema drift, HTTP 500
- **Root cause:** Schema drift — deployed Supabase `addresses` table missing the `excluded_until` column declared in `schema.sql`. Server's `?activeOnly=true` PostgREST `or('excluded_until.is.null,excluded_until.lt.<now>')` 500s. Background `GET_ADDRESSES` handler did `.then(res => res.json())` without `res.ok` check, so the JSON error body was forwarded as `{ addresses: { error: ... } }`. Popup `Array.isArray(response.addresses)` is false → `setAddresses([])` → "No address available" everywhere.
- **Fix:** Path A — manual SQL migration `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS excluded_until timestamptz;` (user runs in Supabase) + harden `src/background/index.ts` `GET_ADDRESSES` handler with `res.ok` check that routes non-2xx through the `error` channel.
- **Files changed:** src/background/index.ts, .planning/phases/02-address-display-debug/02-DEBUG-LOG.md, .planning/phases/02-address-display-debug/02-FIX.md, .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md
---
