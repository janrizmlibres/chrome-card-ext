# Phase 2 — Fix: address-display-empty

**Path chosen:** A — Restore `excluded_until` column on the live `addresses` table (user-authorized schema change) + harden the background `GET_ADDRESSES` handler so future server 5xx responses surface as visible errors instead of silent empty pools.

**Status:** Code fix applied; SQL migration is a manual step the user must run in Supabase Studio.

---

## 1. Manual SQL Migration (USER MUST RUN)

Run the following in the Supabase SQL editor (or via `psql`) against the project's database:

```sql
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS excluded_until timestamptz;
```

Notes:
- `IF NOT EXISTS` keeps the migration idempotent in case the column is later restored elsewhere.
- The column is nullable. New rows default to `NULL`, which the server's `or('excluded_until.is.null,excluded_until.lt.<now>')` clause treats as "active" — so no backfill is required.
- This restores parity with `schema.sql:160`, where the column was already declared.

**Do NOT execute the migration via this fix** — Supabase service-role DDL via the JS client would conflate code rollout and DB migration. Run it manually so you control the order.

## 2. Code Change Applied

### `src/background/index.ts` — `GET_ADDRESSES` handler

The handler was:

```ts
fetch(`http://localhost:3000/api/addresses?${params.toString()}`)
  .then(res => res.json())
  .then(data => sendResponse({ addresses: data }))
  .catch(err => sendResponse({ error: err.message }));
```

This forwarded a non-2xx JSON error body as `addresses`, causing the popup's `Array.isArray` guard to silently fall back to `setAddresses([])` and render "No address available" for every card row.

The handler now checks `res.ok` and routes non-2xx responses through the `error` channel:

```ts
fetch(`http://localhost:3000/api/addresses?${params.toString()}`)
  .then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (body && typeof body === 'object' && 'error' in body && body.error) ||
        `HTTP ${res.status} ${res.statusText}`;
      console.error('[GET_ADDRESSES] Backend returned non-2xx:', res.status, message);
      sendResponse({ error: message });
      return;
    }
    sendResponse({ addresses: body });
  })
  .catch((err) => {
    console.error('[GET_ADDRESSES] fetch failed:', err);
    sendResponse({ error: err.message });
  });
```

Why this is part of the fix (not just a nicety):
- Without the SQL migration, the popup was symptomatic (empty list) instead of diagnostic (visible error). The hardening ensures any future 5xx from the addresses route — including a regression of this very bug — surfaces immediately as a console error and an `[fetchAddresses] Error fetching addresses: ...` line in `App.tsx`, instead of silently rendering a fully populated UI minus the addresses.

### Files changed

- `src/background/index.ts` — `GET_ADDRESSES` handler hardened (1 logical change, ~15 lines).

### Files NOT changed

- `server/index.ts` — `activeOnly` filter and `mark_used` `excluded_until` write are correct against `schema.sql`; they will work once the SQL migration runs.
- `src/popup/App.tsx` — `fetchAddresses` and `activeAddresses` re-filter are already correct.
- `src/lib/types.ts` — `Address.excluded_until` is correct against `schema.sql`.

## 3. Verification Recipe

### Step 1 — Apply the SQL migration

Run the SQL from §1 in Supabase Studio. Expected output: `ALTER TABLE` (or no-op if already present).

### Step 2 — Verify the API directly

With `npm run server` running on `:3000`:

```bash
# Should return HTTP 200 and a JSON array of length > 0
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/addresses | tail -2

# Should ALSO return HTTP 200 (this is the call that was 500ing before).
# Count should be ≤ unfiltered count and equal it whenever no rows have a
# future `excluded_until` (the default state immediately after migration).
curl -s -w "\nHTTP %{http_code}\n" 'http://localhost:3000/api/addresses?activeOnly=true' | tail -2

# Counts comparison (sanity)
echo "all=$(curl -s http://localhost:3000/api/addresses | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
echo "active=$(curl -s 'http://localhost:3000/api/addresses?activeOnly=true' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
```

**Pass criteria:**
- Both endpoints return HTTP 200.
- `all` count > 0 (172 in the current test environment).
- `active` count == `all` immediately after migration (no rows yet have a future `excluded_until`).

### Step 3 — Popup smoke test

1. `npm run build`, reload the unpacked extension in Chrome (`chrome://extensions` → reload Slash Vault).
2. Open the popup → sign in as a user with addresses.
3. Switch to the Vault tab.
4. Each card row should render `Address: <name> — <city>, <state> (<n> uses)` instead of "No address available".
5. Open Chrome DevTools on the popup. Confirm:
   - No `[GET_ADDRESSES] Backend returned non-2xx` errors.
   - No `[fetchAddresses] Error fetching addresses:` lines.
   - No `[fetchAddresses] TIMEOUT` lines.

### Step 4 — Confirm the latent secondary bug is also resolved

After the migration, click an autofill action that uses an address (or hit `POST /api/autofill/mark_used` directly with an `addressId`). The endpoint should return 200; the address row's `excluded_until` should be set to a future timestamp. (Out of strict Phase 2 scope but worth a one-shot check since the SQL migration covers it.)

### Failure paths

If Step 3 still shows "No address available" after Steps 1–2 pass:
- Check DevTools popup console for `[GET_ADDRESSES] Backend returned non-2xx:` — would indicate a different, new server error.
- Check Network tab on the popup background for the `/api/addresses?activeOnly=true` request and inspect the response body.
- Re-run `curl` from Step 2 to rule out an extension-side caching issue.

## 4. Out of Scope (captured as follow-ups)

See `.planning/phases/02-address-display-debug/02-DEBUG-LOG.md` §7. Summary:
- Schema drift cleanup (`external_id`, `first_name`, `last_name` not in `schema.sql`).
- `CLAUDE.md` "Address data flow" doc drift.
- Same `.then(res => res.json())` anti-pattern in sibling `chrome.runtime.onMessage` handlers in `src/background/index.ts`.

## 5. Trace

- Resolved debug session: `.planning/debug/resolved/address-display-empty.md`
- Debug log: `.planning/phases/02-address-display-debug/02-DEBUG-LOG.md`
- Bundle: `.planning/phases/02-address-display-debug/02-DEBUG-CONTEXT.md`
- Requirements satisfied: `DEBUG-01`, `DEBUG-02`
