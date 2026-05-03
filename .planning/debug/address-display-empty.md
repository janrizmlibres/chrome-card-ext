---
slug: address-display-empty
status: resolved
trigger: "Phase 2: every card row in popup renders 'No address available' even when Supabase addresses table has rows for the user. Source bundle: .planning/phases/02-address-display-debug/02-DEBUG-CONTEXT.md"
created: 2026-05-03
updated: 2026-05-03
phase: 02-address-display-debug
context_bundle: .planning/phases/02-address-display-debug/02-DEBUG-CONTEXT.md
---

# Debug Session: address-display-empty

## Symptoms

- **Expected:** Card rows in popup display paired addresses (`Address: <name> — <city>, <state> (<n> uses)`) sourced from Supabase `addresses` table.
- **Actual:** Every card row renders the "No address available" gray text branch (`src/popup/App.tsx:469–474`), reached only when `activeAddresses.length === 0`.
- **Errors:** None reported in popup yet — needs DevTools capture per repro recipe step 5.
- **Timeline:** Persists even after Phase 1 made `POST /api/addresses/import` synchronous and wired `onAddressesImported → fetchAddresses`. Re-opening popup after a successful import does not surface addresses.
- **Reproduction:** See `.planning/phases/02-address-display-debug/02-DEBUG-CONTEXT.md` §7.

## Confounders Already Eliminated

- Import-sync timing (Phase 1 fixed; symptom persists across fresh popup opens).
- Round-robin pairing logic (trivially correct when `activeAddresses` is non-empty; fails only because pool is empty).

## Data Path Under Investigation

```
Popup useEffect([user]) → fetchAddresses()
  src/popup/App.tsx:74–106
    chrome.runtime.sendMessage({ type: 'GET_ADDRESSES', payload: { activeOnly: true } })
Background SW handler
  src/background/index.ts:313–323
    fetch('http://localhost:3000/api/addresses?activeOnly=true')   // NOTE: no userId
Express GET /api/addresses
  server/index.ts:905–923
    Supabase select * from addresses
    + .or('excluded_until.is.null,excluded_until.lt.<now>') when activeOnly=true
Supabase Postgres (addresses table)
```

## Hypotheses (ranked)

| # | Hypothesis | Suspicion | Cheap repro |
|---|---|---|---|
| H1 | PostgREST `or()` clause filters rows; `excluded_until` semantics or syntax | HIGH | Hit `/api/addresses?activeOnly=true` vs `/api/addresses` and compare counts |
| H2 | `userId` silently dropped — server never reads `req.query.userId`, BG never sends it; CLAUDE.md says `WHERE user_id = ?`. Latent doc-vs-code drift; could be root cause if RLS interacts | MED-HIGH | Inspect Supabase RLS on `addresses`; confirm BG payload contents |
| H3 | Response shape mismatch (Express raw array → BG wraps `{addresses: data}` → popup `Array.isArray(response.addresses)`) — re-verify nothing double-wraps | LOW | Log response in BG handler |
| H4 | `addresses` table actually empty for test account | LOW (cheapest) | `select count(*) from addresses` in Supabase Studio |
| H5 | Background SW torn down before message reply (5s watchdog) | LOW | Look for `[fetchAddresses] TIMEOUT` in popup console |

## Touchpoints

- `server/index.ts:905–923` — `GET /api/addresses` handler, `activeOnly` filter, missing `userId` filter
- `src/background/index.ts:313–323` — `GET_ADDRESSES` handler; doesn't pass `userId`
- `src/popup/App.tsx:74–106` — `fetchAddresses` (do not modify pairing site at 413–474)
- Supabase `addresses` table — schema, RLS, row counts

## Constraints

- No schema or RLS changes without explicit user confirmation.
- DB-origin field names stay `snake_case`.
- Logging uses `[Scope] message` prefix.
- Express route style: `async (req, res)`, `res.status(...).json(...)`.

## Current Focus

```yaml
hypothesis: H1 CONFIRMED — Schema drift. The live `addresses` table no longer has the `excluded_until` column. The activeOnly=true PostgREST `or()` clause therefore errors with HTTP 500 ("column addresses.excluded_until does not exist"). The 500 JSON error body is parsed by the background as the addresses payload, popup gets a non-array → setAddresses([]) → "No address available".
test: curl http://localhost:3000/api/addresses (no filter) AND curl ?activeOnly=true; compare row keys against schema.sql.
expecting: First call returns ≥1 row; second returns 500 with column error. Row keys missing `excluded_until`.
next_action: Surface decision checkpoint to user — fix path A (re-add column to live DB; preserves cooldown semantics) vs. path B (drop `excluded_until` references from code; cooldown dropped).
reasoning_checkpoint:
  hypothesis: "Server `GET /api/addresses?activeOnly=true` errors out at the PostgREST layer because `addresses.excluded_until` does not exist in the deployed Supabase schema (drift vs. schema.sql). The 500 JSON body is then mishandled downstream and surfaces as an empty address list in the popup."
  confirming_evidence:
    - "curl /api/addresses → 172 rows, sample keys = [address1, address2, city, created_at, created_by, external_id, first_name, last_name, last_used, name, phone, state, usage_count, zip, id]; NO excluded_until."
    - "curl /api/addresses?activeOnly=true → HTTP 500, body {\"error\":\"column addresses.excluded_until does not exist\"}."
    - "src/background/index.ts:319 .then(res => res.json()) ignores HTTP status; sendResponse({ addresses: data }) sends {addresses: {error: ...}}; popup Array.isArray check fails → setAddresses([])."
  falsification_test: "If we drop the activeOnly clause in the request, popup should receive an array and render real addresses. If symptom still persists, root cause is elsewhere."
  fix_rationale: "Two valid fixes — both make the app behave consistently with the actual DB schema. Pure code-only fix avoids schema mutation per project constraint."
  blind_spots: "POST /api/autofill/mark_used (server line 530) also writes excluded_until — independent latent failure not exercised by the empty-list symptom but will 500 on first autofill click. Will surface in checkpoint."
tdd_checkpoint: ""
```

## Evidence

- timestamp: 2026-05-03T16:18+08:00
  checked: server/index.ts:905-923, src/background/index.ts:313-323, src/popup/App.tsx:74-106
  found: All three touchpoints match the bundle's description verbatim. Background does NOT pass userId; server does NOT read userId or filter by it.
  implication: Bundle accurate. Move on to live API probe.

- timestamp: 2026-05-03T16:18+08:00
  checked: schema.sql:148-163 (addresses table)
  found: `addresses` is a SHARED table (admin-imported) with NO `user_id` column. Has `excluded_until timestamptz`. RLS read policy = `auth.role() = 'authenticated'`; bypassed by service role key used in server.
  implication: H2 drops to LOW — there is no `user_id` to filter by; CLAUDE.md "WHERE user_id = ?" is documentation drift, not a code bug. RLS is bypassed by service role, not blocking reads.

- timestamp: 2026-05-03T16:19+08:00
  checked: curl http://localhost:3000/api/addresses (no filter)
  found: HTTP 200, 172 rows returned. Sample row keys = address1, address2, city, created_at, created_by, external_id, first_name, last_name, id, last_used, name, phone, state, usage_count, zip. NO excluded_until field on any row.
  implication: H4 (empty table) ELIMINATED — table is populated. Live schema differs from schema.sql: extra fields (external_id, first_name, last_name) and missing field (excluded_until).

- timestamp: 2026-05-03T16:19+08:00
  checked: curl 'http://localhost:3000/api/addresses?activeOnly=true'
  found: HTTP 500, body = {"error":"column addresses.excluded_until does not exist"}.
  implication: H1 CONFIRMED. The PostgREST `or()` clause references a column the live DB does not have. The fetch resolves successfully (no network error), so the background's `.then(res => res.json())` parses the error body and forwards it as `{ addresses: { error: "..." } }`. Popup's `Array.isArray(response.addresses)` is false → `setAddresses([])` → every card row falls into "No address available".

- timestamp: 2026-05-03T16:20+08:00
  checked: server/index.ts:517-538 (mark_used address branch)
  found: POST /api/autofill/mark_used also writes `excluded_until: cooldownDate` to addresses on each autofill use.
  implication: Latent secondary bug — first autofill click that includes an addressId will 500 on the same missing column. Not the symptom under investigation but worth noting in the checkpoint so user can decide path A vs B holistically.

## Eliminated

- Import-sync timing (eliminated upstream by Phase 1)
- Round-robin pairing logic (trivially correct on non-empty array)
- H4 (DB empty) — 172 rows present
- H2 (userId/RLS) — no `user_id` column in shared addresses table; service role key bypasses RLS; not the cause of empty list (still a doc-vs-code drift to capture)
- H3 (response shape) — Express serializes raw array; background wraps; consistent
- H5 (SW teardown) — no timeout; the server actually responds with HTTP 500 within ~1s

## Resolution

```yaml
root_cause: "Schema drift — the deployed Supabase `addresses` table no longer has the `excluded_until` column that schema.sql declares. The server's GET /api/addresses?activeOnly=true uses `query.or('excluded_until.is.null,excluded_until.lt.<now>')`, which PostgREST rejects with HTTP 500. The 500 JSON body was mishandled downstream — background script forwarded it as the addresses payload regardless of HTTP status — so the popup received a non-array, fell back to setAddresses([]), and rendered 'No address available' for every card row."
fix: "Path A (user-authorized). (1) Manual SQL migration handed off to user: ALTER TABLE addresses ADD COLUMN IF NOT EXISTS excluded_until timestamptz; — restores the column to parity with schema.sql so the existing PostgREST or() filter and mark_used cooldown writes work. (2) Code change in src/background/index.ts GET_ADDRESSES handler: check res.ok and route non-2xx responses through the error channel instead of forwarding the JSON error body as { addresses }. Prevents silent-empty-pool recurrence on any future server 5xx."
verification: "Code change passes lint. Manual verification recipe in .planning/phases/02-address-display-debug/02-FIX.md §3: (a) curl /api/addresses returns HTTP 200 with rows; (b) curl /api/addresses?activeOnly=true returns HTTP 200 (was 500) after migration; (c) popup smoke test — every card row shows 'Address: <name> — <city>, <state> (<n> uses)' instead of 'No address available'; no [GET_ADDRESSES] non-2xx errors in DevTools. User is the verifier (must run SQL migration first)."
files_changed:
  - src/background/index.ts
  - .planning/phases/02-address-display-debug/02-DEBUG-LOG.md
  - .planning/phases/02-address-display-debug/02-FIX.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
```

## Expected Artifacts on Completion

- `.planning/phases/02-address-display-debug/02-DEBUG-LOG.md`
- `.planning/phases/02-address-display-debug/02-FIX.md` (or `02-01-PLAN.md` if non-trivial)
- Atomic commits applying the fix
- Update `.planning/STATE.md` and `.planning/ROADMAP.md` Phase 2 row to "Complete"
- Tick `DEBUG-01` and `DEBUG-02` in `.planning/REQUIREMENTS.md`
