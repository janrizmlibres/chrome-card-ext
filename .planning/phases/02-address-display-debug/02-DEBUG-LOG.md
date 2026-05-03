# Phase 2 — Debug Log: address-display-empty

**Session:** `.planning/debug/resolved/address-display-empty.md`
**Date:** 2026-05-03
**Mode:** `/gsd-debug` — `goal: find_and_fix`, `symptoms_prefilled: true`
**Outcome:** Root cause identified, code fix applied, schema migration handed off to user (Path A).

---

## 1. Symptom (recap)

Every card row in the popup rendered "No address available" (gray text branch at `src/popup/App.tsx:469–474`), reached only when `activeAddresses.length === 0`. Persisted across fresh popup opens after a successful import.

## 2. Hypotheses Tried

| # | Hypothesis | Suspicion (initial) | Outcome |
|---|---|---|---|
| H1 | PostgREST `or()` clause on `excluded_until` filters all rows server-side | HIGH | **CONFIRMED** — but for a different reason than initially framed (column missing, not filter logic) |
| H2 | `userId` silently dropped — RLS interaction or doc-vs-code drift | MED-HIGH | Eliminated as cause; collapsed on first read of `schema.sql` (no `user_id` column on `addresses` at all; service-role bypasses RLS). Doc drift in `CLAUDE.md` confirmed. |
| H3 | Response shape mismatch (Express → background → popup) | LOW | Eliminated — wrapping is consistent. |
| H4 | `addresses` table actually empty for the test account | LOW | Eliminated — table has 172 rows. |
| H5 | Background SW torn down before reply (5s watchdog) | LOW | Eliminated — server replies in ~1s with HTTP 500. |

## 3. Evidence Collected

1. **Code-vs-bundle parity (touchpoints).** `server/index.ts:905–923`, `src/background/index.ts:313–323`, `src/popup/App.tsx:74–106` match the bundle's description verbatim. Background does NOT pass `userId`; server does NOT read or filter by `userId`. (Confirms bundle is accurate; confirms doc drift in `CLAUDE.md`.)
2. **Schema reality.** `schema.sql:148–163` declares `addresses` as a SHARED admin-imported table with NO `user_id` column. Read RLS = `auth.role() = 'authenticated'`; bypassed by the service-role key the server uses. `excluded_until timestamptz` is declared in `schema.sql`.
3. **Live DB probe (no filter).** `curl http://localhost:3000/api/addresses` → HTTP 200, 172 rows. Sample row keys: `address1, address2, city, created_at, created_by, external_id, first_name, last_name, id, last_used, name, phone, state, usage_count, zip`. **No `excluded_until` field on any row. Extra columns `external_id`, `first_name`, `last_name` exist that are not in `schema.sql`.**
4. **Live DB probe (activeOnly=true).** `curl 'http://localhost:3000/api/addresses?activeOnly=true'` → HTTP 500, body `{"error":"column addresses.excluded_until does not exist"}`.
5. **Downstream propagation.** `src/background/index.ts` did `.then(res => res.json())` without checking `res.ok`, so the JSON error body `{ error: "..." }` was forwarded as `sendResponse({ addresses: { error: "..." } })`. The popup's `Array.isArray(response.addresses)` is false for an object → `setAddresses([])` → "No address available" for every card row.
6. **Latent secondary callsite.** `server/index.ts:517–538` (`POST /api/autofill/mark_used`) also writes `excluded_until: cooldownDate` to `addresses`. Same column drift will 500 on the first autofill click that includes an `addressId`. Not exercised by the empty-list symptom but the same root cause.

## 4. Root Cause (canonical statement)

The deployed Supabase `addresses` table no longer has the `excluded_until timestamptz` column declared in `schema.sql`. This is a schema-vs-code drift. The server's `GET /api/addresses?activeOnly=true` issues `query.or('excluded_until.is.null,excluded_until.lt.<now>')`, which PostgREST rejects with HTTP 500. Because the background's `GET_ADDRESSES` handler did not check `res.ok`, the JSON error body was forwarded as the addresses payload. The popup's `Array.isArray` guard fell through to `setAddresses([])`, and the round-robin pairing produced `undefined` for every card → "No address available" rendered everywhere.

## 5. Path D Note (offered, not chosen)

A fourth fix path was considered: derive cooldown gating from `last_used + GLOBAL_COOLDOWN_INTERVAL` instead of `excluded_until`. This was **not chosen** because:

- There is no existing cooldown mechanism that uses `last_used`. `last_used` is currently used **only for ordering** in `server/index.ts:912` (`.order("last_used", { ascending: true, nullsFirst: true })`).
- Cards and addresses both rely on `excluded_until` for cooldown gating in three places:
  - `server/index.ts:294` — card cooldown filter
  - `src/popup/App.tsx:143–153` — `activeCards` and `activeAddresses` re-filters
  - `src/popup/App.tsx:432–479` — pairing/render guard
  - `server/index.ts:528–530` — `mark_used` writes `excluded_until`
- Switching to a derived `last_used`-based cooldown would touch all four sites and change semantics (per-row TTL → global TTL). Out of proportion to the symptom and out of scope.

## 6. Decision

**Path A: restore the column on the live DB** (user-authorized schema change) plus background handler hardening.

- Path A preserves the cooldown design already encoded across server, popup, and types.
- Path B (strip `excluded_until` from code) was rejected because it amputates a working design over what is fundamentally a data drift.
- The `res.ok` hardening in the background handler is independent of A vs B: it converts a future server 5xx into a visible error in DevTools instead of silent emptiness. Strongly worth keeping regardless.

## 7. Follow-ups Captured (not in scope of Phase 2)

These are deliberately surfaced here and **not** auto-applied — they are noted for a future micro-phase or `gsd-capture` triage:

1. **`mark_used` will 500 on first address autofill until the column is restored.** Same root cause; resolved by the same SQL migration. Verify after the user runs the migration.
2. **Schema drift cleanup.** Live `addresses` table has `external_id`, `first_name`, `last_name` columns not in `schema.sql`. Reconcile in a separate schema-hygiene pass.
3. **`CLAUDE.md` documentation drift.** "Address data flow" section claims `SELECT … WHERE user_id = ?`; the table has no `user_id` column and the route doesn't filter by user. One-line correction.
4. **Sibling background handlers.** Other `chrome.runtime.onMessage` handlers in `src/background/index.ts` follow the same `.then(res => res.json()).then(data => sendResponse(...))` pattern and would also forward a 5xx body as data. Worth a sweep — out of scope here per the explicit instruction "do not expand scope". Captured for follow-up.

## 8. References

- Resolved debug session: `.planning/debug/resolved/address-display-empty.md`
- Fix detail (SQL migration + verification recipe): `.planning/phases/02-address-display-debug/02-FIX.md`
- Bundle: `.planning/phases/02-address-display-debug/02-DEBUG-CONTEXT.md`
- Requirements: `DEBUG-01`, `DEBUG-02` in `.planning/REQUIREMENTS.md`
