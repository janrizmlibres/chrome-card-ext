# Phase 2: Address Display Debug — Offload Bundle for `/gsd-debug`

**Extracted from:** `.planning/ROADMAP.md` §"Phase 2: Address Display Debug"
**Extracted on:** 2026-05-03
**Owner mode:** `/gsd-debug` (scientific-method debugging session)
**Status:** Ready for debug intake

This file is **self-contained**. The debug skill should not need to re-read `ROADMAP.md` or `REQUIREMENTS.md` to start work — everything Phase 2 needs is below.

---

## 1. Symptom (what the user sees)

Every card row in the popup renders **"No address available"** under the card details, even when the Supabase `addresses` table contains rows for the user's account.

Render site: `src/popup/App.tsx:469–474`

```469:474:src/popup/App.tsx
                        {pairedAddress ? (
                          <div className="text-gray-600">
                            Address: {pairedAddress.name} — {pairedAddress.city}, {pairedAddress.state} ({pairedAddress.usage_count} uses)
                          </div>
                        ) : (
                          <div className="text-gray-400">No address available</div>
```

The "No address available" branch is reached whenever `activeAddresses[idx % activeAddresses.length]` resolves to `undefined`, i.e. when `activeAddresses.length === 0`.

## 2. Goal & Done Criteria

**Goal:** Identify and fix the root cause so addresses stored in Supabase appear correctly in the popup's active address pool.

**Done when:**
1. Root cause is identified and documented (e.g., wrong `userId` filter, missing field in API response, background message handler gap, RLS, PostgREST `or()` syntax, etc.).
2. Addresses present in Supabase appear in the popup's `activeAddresses` array.
3. Card rows show paired addresses from the pool; "No address available" only appears when the pool is genuinely empty.

**Maps to requirements:** `DEBUG-01` (root cause identified), `DEBUG-02` (bug resolved). See `.planning/REQUIREMENTS.md`.

## 3. Confounding Variables — Already Eliminated

- **Import sync timing is NOT the cause.** Phase 1 (`.planning/phases/01-import-sync/`) made `POST /api/addresses/import` synchronous and wired `onAddressesImported → fetchAddresses`. Even with a fresh popup open after a successful import, addresses still don't appear. Treat this as an isolated data/fetch bug, not a refresh-timing bug.
- **Pairing logic is NOT the cause.** Round-robin (`activeAddresses[idx % activeAddresses.length]`) is trivially correct when the array is non-empty. Pairing only fails because `activeAddresses` itself is empty.

## 4. End-to-End Data Path (trace this)

```
Popup useEffect([user])  →  fetchAddresses()
  src/popup/App.tsx:74–106, 108–115
        │  chrome.runtime.sendMessage({ type: 'GET_ADDRESSES', payload: { activeOnly: true } })
        ▼
Background SW handler
  src/background/index.ts:313–323
        │  fetch('http://localhost:3000/api/addresses?activeOnly=true')
        ▼
Express GET /api/addresses
  server/index.ts:905–923
        │  Supabase select * from addresses
        │  + or(excluded_until.is.null,excluded_until.lt.<now>) when activeOnly=true
        ▼
Supabase Postgres (addresses table)
```

Then back up:

```
Express  → res.json(data as Address[])     // raw array
Background → sendResponse({ addresses: data })
Popup    → if (Array.isArray(response.addresses)) setAddresses(response.addresses)
         → activeAddresses = addresses.filter(a => !a.excluded_until || new Date(a.excluded_until) <= new Date())
```

## 5. Hypotheses (ranked by suspicion)

### H1 — PostgREST `or()` clause filters out rows it shouldn't  *(HIGH suspicion)*
`server/index.ts:915–917`:
```ts
if (activeOnly === "true") {
  query = query.or(`excluded_until.is.null,excluded_until.lt.${now}`);
}
```
- Quick check: does *every* address row have `excluded_until` set to a future timestamp? If yes, all rows get filtered out server-side.
- Also verify the `or()` string is parsed correctly by PostgREST — it should be, but worth executing the same query directly against Supabase and comparing counts vs. `activeOnly=false`.
- **Cheap repro:** in DevTools network tab, hit `http://localhost:3000/api/addresses?activeOnly=true` vs. `http://localhost:3000/api/addresses` — if the first returns `[]` and the second returns rows, this is the cause.

### H2 — `userId` is silently dropped  *(MEDIUM-HIGH suspicion / latent bug regardless)*
- `CLAUDE.md` ("Address data flow") describes the query as `SELECT … WHERE user_id = ?` but `server/index.ts:905–923` does **not** filter by `user_id` at all and never reads `req.query.userId`.
- The background handler also never passes `userId` (`src/background/index.ts:313–323`).
- This means every user sees every address — but it does NOT explain the empty-list symptom directly. However, if a recent migration added a `NOT NULL` `user_id` column with a per-row check via Supabase RLS, the service-role bypass might still hide rows depending on policy. Worth inspecting Supabase RLS on `addresses`.
- **Even if not the root cause, the doc-vs-code drift is a real bug to capture.**

### H3 — Response shape mismatch  *(LOW suspicion — code looks consistent)*
- Express returns the raw array (`res.json(data as Address[])`).
- Background wraps it: `sendResponse({ addresses: data })`.
- Popup checks `Array.isArray(response.addresses)` ✓.
- Re-verify the wrapping wasn't changed somewhere; if Express ever returned `{ data: [...] }` or `{ addresses: [...] }`, the background would re-wrap into `{ addresses: { addresses: [...] } }` and the popup would silently fall to `setAddresses([])` (line 102).

### H4 — `addresses` table actually empty for the test account  *(LOW suspicion but check first — cheapest)*
- Open Supabase studio and `select count(*) from addresses;`. If 0, this isn't a code bug — it's an admin-import-never-succeeded issue and Phase 1's import path needs re-verification.

### H5 — Background SW torn down between popup-open and message  *(LOW suspicion)*
- MV3 service workers are non-persistent. Watchdog fires after 5s in the popup; if it fires we'd see `[fetchAddresses] TIMEOUT` in the popup console. Confirm logs first.

## 6. Touchpoints (read these first)

**Likely change sites (root cause + fix):**
- `server/index.ts:905–923` — `GET /api/addresses` handler; `activeOnly` filter and missing `userId` filter
- `src/background/index.ts:313–323` — `GET_ADDRESSES` message handler; doesn't pass `userId`
- `src/popup/App.tsx:74–106` — `fetchAddresses`
- `src/popup/App.tsx:150–153` — `activeAddresses` client-side re-filter (defense in depth; should match server)

**Schema / DB to inspect:**
- Supabase `addresses` table — columns (`user_id`, `excluded_until`, `active`?), row counts, RLS policies

**Pairing site (do NOT modify — confirms the symptom):**
- `src/popup/App.tsx:413–474` — `pairedAddress` round-robin and "No address available" render branch

## 7. Reproduction Recipe

1. Run backend: `npm run server` (Express on `:3000`).
2. Run extension: `npm run dev` and load `dist/` unpacked in Chrome.
3. Sign into the popup as a user known to have addresses in Supabase.
4. Open the popup → switch to the Vault tab.
5. Open Chrome DevTools on the popup; capture:
   - `[fetchAddresses]` logs
   - The actual `GET /api/addresses?activeOnly=true` response body and status from the background's network panel
6. Compare against a direct call to the same URL in a regular browser tab and against a direct Supabase query.

## 8. Constraints & Style

- **Make no schema or RLS changes** without explicit user confirmation.
- Keep server changes minimal and consistent with the existing route style (`async (req, res)`, `try/catch` if needed, `res.status(...).json(...)`).
- DB-origin field names stay `snake_case` (`user_id`, `excluded_until`, `usage_count`) per `CLAUDE.md`.
- Logging must use the `[Scope] message` prefix convention.
- Popup viewport stays 400×600; no UI added in this phase.

## 9. Out of Scope for Phase 2

- Address filtering UI (state/city) — that's **Phase 3**.
- Per-card sticky address assignment — v2 only.
- Adding authentication enforcement to Express routes — separate engagement.
- Refactoring `fetchAddresses` watchdog or message-handler patterns beyond what the fix requires.

## 10. Canonical References (read-before-acting)

- `CLAUDE.md` §"Address data flow", §"Chrome Messaging (critical pattern)" — describes intended `WHERE user_id = ?` filter and the watchdog protocol the popup already follows
- `.planning/PROJECT.md` — overall product context, address-card pairing model
- `.planning/REQUIREMENTS.md` — `DEBUG-01`, `DEBUG-02`
- `.planning/codebase/ARCHITECTURE.md` §"Backend (Express + ts-node)" — addresses route summary
- `.planning/codebase/STRUCTURE.md` §`server/index.ts`
- `.planning/phases/01-import-sync/01-CONTEXT.md` — confirms import-sync was already fixed (rules out as confound)

## 11. Expected Debug Artifacts

When `/gsd-debug` finishes, the following should exist in this directory:
- `02-DEBUG-LOG.md` — hypotheses tried, evidence collected, root cause statement
- `02-FIX.md` (or a single `02-01-PLAN.md` if fix is non-trivial) — change set with rationale
- Atomic commits applying the fix
- Update `.planning/STATE.md` and `.planning/ROADMAP.md` Phase 2 row to "Complete"
- Tick `DEBUG-01` and `DEBUG-02` in `.planning/REQUIREMENTS.md`

---

*Bundle prepared: 2026-05-03 — kick off with `/gsd-debug` pointing at this file.*
