# Codebase Concerns

**Analysis Date:** 2026-05-03

## Tech Debt

**Hardcoded `http://localhost:3000` API base URL across the extension:**
- Issue: The Express backend URL is hardcoded throughout the extension instead of using the centralized `API_BASE_URL` constant (defined in `src/lib/constants.ts:2`).
- Files: `src/background/index.ts:285,318,330,352,451,529,535,543,550,558,587`, `src/components/AdminOptions.tsx:103,111,119,132,197,260,380,452,482`
- Impact: Extension cannot be built for staging/production without find-and-replace; risk of mismatched URLs; ships an extension that only works against `localhost`.
- Fix approach: Replace every literal `http://localhost:3000` with `API_BASE_URL` from `src/lib/constants.ts`, and convert the constant into a Vite env var (`VITE_API_BASE_URL`) so the URL is environment-driven.

**Hardcoded fallback `userId: 'user-123'` for selector saves:**
- Issue: `src/background/index.ts:356` falls back to literal string `'user-123'` when no user is logged in.
- Files: `src/background/index.ts:356`
- Impact: Pollutes `selector_profiles.user_id` with a non-existent UUID; will break the `references users(id)` foreign key in `schema.sql:88` (or already silently fails inserts depending on FK enforcement); makes audit trails meaningless.
- Fix approach: Reject `SAVE_SELECTOR` messages without a real `userId` and surface the error to the user.

**Pervasive `console.log` debug noise in production code:**
- Issue: `getCurrentUser`, `signIn`, `useAuth`, `App`, background message handlers, and content script all emit verbose `[…]`-prefixed logs unconditionally.
- Files: `src/lib/auth.ts:25,78,90,99,107,127,129,137,141,165,202,223,238,295`, `src/lib/useAuth.ts:6,11,15`, `src/popup/App.tsx:15,17,30,32,36,41,45,109,111`, `src/background/index.ts:254,260,273,283,287,291,328,336,340`, `src/content/index.ts:5,19,111`
- Impact: Leaks user emails (e.g. `'[signIn] Sign in complete:', user.email`) and session lifecycle into the browser/extension console; noisy DevTools; potential PII in user-shared screenshots.
- Fix approach: Wrap behind a `DEBUG` flag from env, or strip via Vite `define` / build plugin.

**Server uses single global Express app with `1 << 30` `setInterval` keep-alive hack:**
- Issue: `server/index.ts:1017` adds `setInterval(() => {}, 1 << 30)` to keep the event loop alive.
- Files: `server/index.ts:1012-1018`
- Impact: Workaround papering over an underlying problem (likely ts-node/nodemon teardown issue); can mask real shutdown bugs and leaks an interval.
- Fix approach: Investigate why `app.listen` isn't holding the loop; remove the hack once root cause is fixed.

**Selector save endpoint duplicates a giant if/else field switch:**
- Issue: `POST /api/selectorProfiles` has 11 sequential `else if` branches (`fieldType === "cardNumber"` … `=== "name"`).
- Files: `server/index.ts:742-768`
- Impact: Adding a new field type requires editing four places (`SELECTOR_DB_FIELDS`, `mapDbRowToSelectorProfile`, the if/else chain, and the response mapper). Already drifting — `PATCH /api/selectorProfiles/:id` uses the table-driven approach but `POST` does not.
- Fix approach: Reuse the `SELECTOR_DB_FIELDS` map (`server/index.ts:112`) for both endpoints.

**Manual camelCase ⇄ lowercase column mapping:**
- Issue: Postgres columns are stored in lowercase (`cardnumberselectors`) while the API uses camelCase, requiring per-field mapping.
- Files: `server/index.ts:112-141,695-708,785-800`, `schema.sql:65-76`
- Impact: Easy to forget mapping when adding a column; bugs are silent (field reads as `undefined`, saved as missing).
- Fix approach: Quote identifiers in the schema (e.g. `"cardNumberSelectors"`) or accept the lowercase form throughout the app.

**`tsconfig.json`/`tsconfig.server.json` not reviewed for strict mode:**
- Issue: Type safety unknown; many `any` usages noted in server (`SlashCard.userData?: Record<string, any>`, `req.body || {}` casts).
- Files: `server/index.ts:22,176,199,311,454`, `tsconfig.json`, `tsconfig.server.json`
- Fix approach: Audit `strict`/`noImplicitAny` flags and replace `any` with proper types.

## Known Bugs

**`getCurrentUser` race / cache invalidation:**
- Symptoms: `cachedUser` (`src/lib/auth.ts:19`) is set on first read but never invalidated when the underlying Supabase session changes (refresh token rotation, server-side ban, RLS update).
- Files: `src/lib/auth.ts:75-183`
- Trigger: User stays signed in across long sessions; role/group is updated server-side; UI continues to read stale `cachedUser`.
- Workaround: Reload the popup.

**`onAuthStateChange` is purely manual — Supabase events ignored:**
- Symptoms: The Supabase client's own `auth.onAuthStateChange` is not subscribed; only `signIn`/`signOut` invoke `notifyAuthListeners`. Token refresh failures or external sign-out won't propagate.
- Files: `src/lib/auth.ts:332-350`, `src/lib/supabase.ts:9-16` (`autoRefreshToken: false`).
- Trigger: Refresh token expires; user remains "logged in" in UI until manual sign-out.
- Fix: Subscribe to Supabase auth events and bridge them to local listeners, or re-enable `autoRefreshToken` with a Chrome-storage adapter.

**Settings endpoint silently masks `PGRST116`:**
- Symptoms: `GET /api/settings` ignores `PGRST116` (no rows) and returns default `{ cooldownInterval: 30 }` (`server/index.ts:568-577`), but `POST /api/settings` upserts `id: 1` regardless of the request body. Posting without `cooldownInterval` writes `null`.
- Files: `server/index.ts:579-591`
- Fix: Validate `cooldownInterval` is a positive number.

**`bestAddress` always picks `addresses[0]` regardless of context:**
- Symptoms: Autofill flow forcibly fills the first address on every page even when the page has no address fields.
- Files: `src/background/index.ts:114,184-209`
- Trigger: Autofilling on a page with only card fields still attempts an address fill and triggers `markAutofillUsed` cooldown for the address.
- Fix: Only attach `bestAddress` when the page has matching address candidates.

**`signUp` returns user without checking the persistence response status code consistently:**
- Symptoms: If `attach-slash-group` fails, a warning is logged but the function still resolves with the supposed `slashGroupId`, leaving the DB out of sync with the in-memory user.
- Files: `src/lib/auth.ts:280-296`
- Fix: Treat persistence failure as fatal, or roll back the Slash group.

## Security Considerations

**Backend has no authentication on any endpoint:**
- Risk: Every Express route (cards, full-card with PAN/CVV, settings, selectors, addresses, mark_used, attach-slash-group) accepts unauthenticated requests. The server uses the Supabase **service role key** (`server/supabase.ts:8`) which bypasses RLS, so any caller who can reach `localhost:3000` (or wherever it's deployed) gets full read/write to the database **and** can pull full PAN/CVV from `/api/cards/:id/full`.
- Files: `server/index.ts:154,253,309,399,453,568,579,595,621,631,670,820,846,895,905,926,943`, `server/supabase.ts:8-19`
- Current mitigation: None. CORS is `app.use(cors())` (default = allow any origin) at `server/index.ts:154`. The "auth" check is just `?role=user&groupId=...` query params trusted from the client (`server/index.ts:262,287,407,435`).
- Recommendations: Require a Supabase JWT in `Authorization: Bearer …`, validate it server-side via `supabase.auth.getUser(token)`, derive `userId`/`role`/`groupId` from the token (never the client), and enforce per-route authorization.

**Open CORS (`app.use(cors())`):**
- Risk: Any website the user visits could fetch `http://localhost:3000/api/cards/<id>/full` while the dev server is running and exfiltrate full PAN/CVV without the user noticing.
- Files: `server/index.ts:154`
- Mitigation: None.
- Recommendations: Whitelist the extension origin (`chrome-extension://<extension-id>`) only, and require the JWT above.

**Manifest `host_permissions` is `<all_urls>` + `http://*/*` and content script `matches: ["<all_urls>"]`:**
- Risk: Content script and network watcher run on every page (including banking, email). The injected `networkWatcherMain` (`src/content/networkWatcherInjected.ts`) monkey-patches `window.fetch` and `XMLHttpRequest.prototype.send` in the **MAIN world** (`src/background/index.ts:483`) on every domain that has a stored `network_profiles` rule, intercepting JSON response bodies.
- Files: `public/manifest.json:12-15,23-29`, `src/content/networkWatcherInjected.ts:100-152`, `src/background/index.ts:466-495`
- Mitigation: Only fires when a matching `NetworkRule` is configured.
- Recommendations: Restrict `host_permissions`/`matches` to domains where users opt-in; use `activeTab` + on-demand injection rather than `document_start` on `<all_urls>`.

**PAN/CVV fetched over plain `http://localhost:3000`:**
- Risk: Full card numbers and CVVs traverse `http://` even in production builds (the URL is hardcoded). On a multi-user macOS / shared dev machine, any local process can sniff or proxy.
- Files: `src/background/index.ts:543` (`/api/cards/:id/full`)
- Mitigation: Localhost only (today).
- Recommendations: Force HTTPS for non-dev builds; never log PAN/CVV (currently mostly OK — `server/index.ts:389-391` strips them on create).

**RLS policies on `selector_profiles`/`network_profiles`/`addresses` are effectively "any authenticated user":**
- Risk: `schema.sql:91-103` grants any authenticated user full CRUD on selector profiles. A malicious user could inject CSS selectors that match sensitive inputs on shared domains, weaponizing the autofill flow.
- Files: `schema.sql:88-103`
- Recommendations: Scope SELECT to the user's group, restrict UPDATE/DELETE to the row owner or admins.

**Service-role key handling in backend:**
- Risk: `server/supabase.ts:8` falls back from `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_KEY`; combined with the README documenting `SUPABASE_KEY=your_service_role_key` (`README.md:145`), users will mix anon and service-role keys.
- Files: `server/supabase.ts:8`, `README.md:139-148`
- Recommendations: Rename README var to `SUPABASE_SERVICE_ROLE_KEY`; remove the fallback to avoid silent misconfiguration.

**Chrome storage holds raw Supabase access + refresh tokens:**
- Risk: `signIn` writes `{ access_token, refresh_token }` to `chrome.storage.local` (`src/lib/auth.ts:225-233`). Other extensions cannot read it (Chrome isolates per-extension storage), but malware with disk access can.
- Files: `src/lib/auth.ts:15,225-233,313`
- Mitigation: Standard Chrome isolation.
- Recommendations: Acceptable for now; document the trust model.

**`SLASH_API_KEY` defaults to empty string but server still starts:**
- Risk: Server boots without a Slash API key and only fails per-request, making misconfiguration easy to miss.
- Files: `server/index.ts:9,205-208,257-260,317-319`
- Recommendations: Fail fast at startup if required envs are missing.

**Repository tracks `schema.sql` (safe, schema only) — confirmed no `.env`/secrets in git:**
- Verified: `git ls-files` shows no `.env`, credential, or key files; `.gitignore` covers `.env`, `.env.test`, `.env.production`. `schema_reset.sql` is on disk but **untracked** (consistent with commit `57a07d8 "Stop tracking schema_reset.sql"`).
- Files: `.gitignore:71-74`, repo file listing
- Status: OK.

## Performance Bottlenecks

**`/api/cards` fetches the entire Slash card collection on every request, then filters in Node:**
- Problem: `server/index.ts:269` requests `${SLASH_API_BASE_URL}/card?filter:cardGroupId=...`, then `server/index.ts:288` re-filters by `slash_group_id` in JS. No pagination, no caching.
- Files: `server/index.ts:253-306`
- Cause: Trusts Slash to honor the filter and double-filters; no result limit.
- Improvement path: Verify Slash API server-side filtering, add pagination, cache responses for short TTL keyed by `groupId`.

**Card-create polling loop (up to 6 × 500ms = 3s blocking):**
- Problem: After creating a card, server polls Slash up to 6 times waiting for `last4`/expiry to populate (`server/index.ts:362-386`).
- Files: `server/index.ts:362-386`
- Cause: Slash API is asynchronously hydrating the card.
- Improvement path: Return immediately with `pending: true` and let the client poll, or use a webhook from Slash.

**`mark_used` performs sequential GET → PATCH against Slash plus a Supabase audit insert per call:**
- Problem: Three round trips per autofill (`server/index.ts:476,497,541`).
- Files: `server/index.ts:453-563`
- Improvement path: Drop the GET (PATCH with computed delta from cached card data) and queue audit inserts.

**Address import done in foreground after `res.status(202)`, but error handling continues blindly:**
- Problem: `server/index.ts:996-1009` chunks 500 rows at a time; on chunk failure it logs and continues, leaving partial state with no client visibility.
- Files: `server/index.ts:990-1010`
- Improvement path: Track per-chunk status; expose a `/api/addresses/import/:jobId/status` endpoint.

**Selector profile updates rewrite entire arrays:**
- Problem: Every selector save reads the full row, dedupes in JS, and writes back the whole array (`server/index.ts:730-768`).
- Files: `server/index.ts:670-808`
- Improvement path: Use Postgres array_append with a uniqueness check, or move selectors to a child table.

## Fragile Areas

**`server/index.ts` is a 1018-line monolith holding every route, mapper, and helper:**
- Files: `server/index.ts` (1018 lines)
- Why fragile: All business logic in one file with no module boundaries; any change risks breaking unrelated routes.
- Safe modification: Extract per-resource routers (`server/routes/cards.ts`, `server/routes/selectorProfiles.ts`, etc.) before adding new endpoints.
- Test coverage: None.

**`src/components/AdminOptions.tsx` is 832 lines of mixed concerns:**
- Files: `src/components/AdminOptions.tsx` (832 lines)
- Why fragile: Selector profiles, settings, network profiles, and address import all in one component; lots of `useState` interactions; visual editing logic intertwined with API calls.
- Safe modification: Extract sub-components per tab (SelectorsTab, NetworkTab, AddressesTab, SettingsTab).

**`src/content/index.ts` builds modal DOM imperatively for ~100 lines (`showCardSelectionModal`, `src/content/index.ts:134-299`):**
- Why fragile: Hand-built DOM with inline styles is hard to maintain; relies on `z-index: 2147483647` to win against host pages.
- Safe modification: Use Shadow DOM + a small framework (or template strings) to encapsulate styles.

**`networkWatcherInjected.ts` monkey-patches `window.fetch` and `XMLHttpRequest`:**
- Files: `src/content/networkWatcherInjected.ts:100-152`
- Why fragile: Runs in MAIN world on `<all_urls>`; subtle bugs (e.g. throwing inside the wrapped fetch) could break unrelated host-site network calls. Patch is one-shot via `__slashNetworkWatcherInstalled`, so re-injection after SPA navigations is impossible.
- Safe modification: Add try/catch around the entire wrapper; document MAIN-world contract clearly.

**Manual session storage instead of Supabase storage adapter:**
- Files: `src/lib/auth.ts:15,99-131,225-233`
- Why fragile: Bypasses Supabase token refresh entirely (`autoRefreshToken: false` in `src/lib/supabase.ts:11`). When the access token expires, `setSession` will fail and the user is silently logged out.
- Safe modification: Implement a Chrome-storage adapter for the Supabase client and re-enable `autoRefreshToken`.

**Hardcoded port `3000` and no graceful shutdown:**
- Files: `server/index.ts:152,1017`
- Why fragile: Port collision crashes the process; the keep-alive interval prevents clean exit.

## Scaling Limits

**No pagination on cards, addresses, selector profiles, or network profiles:**
- Current capacity: All data returned in single payload.
- Files: `server/index.ts:269,595,820,905`
- Scaling path: Add `?limit=&cursor=` query params; index `last_used`, `created_at`.

**Address import chunk size 500, max body `50mb`:**
- Files: `server/index.ts:155-156,995`
- Limit: Single 50MB JSON parse will block the event loop; large imports tie up the (single) Node process.
- Scaling path: Stream uploads, use a job queue.

**Single-row `settings` table assumed:**
- Files: `schema.sql:55-58`, `server/index.ts:583-585`
- Limit: No multi-tenant settings; cooldown is global.

## Dependencies at Risk

**`body-parser` v2 listed but Express 5 includes its own body parsers:**
- Files: `package.json:20`
- Risk: Unused dependency; potential confusion / version drift.

**Express 5 (`^5.2.1`) is a recent major:**
- Files: `package.json:24`
- Risk: Breaking changes from Express 4 idioms (route param handling, async error middleware) — code uses `res.json()` returns inside async handlers without `next(err)` patterns.
- Mitigation: Add an Express error middleware.

**`ts-node` listed under `dependencies` instead of `devDependencies`:**
- Files: `package.json:31`
- Risk: Bloats production install footprint.

**No lockfile diversity check / `npm audit` discipline visible** (no CI config in repo).

## Missing Critical Features

**No automated tests at all:**
- Problem: `package.json:9` has the placeholder `"test": "echo \"Error: no test specified\" && exit 1"`. There are no `*.test.ts` or `*.spec.ts` files anywhere.
- Blocks: Refactoring confidence; regression detection; CI gating.

**No CI/CD pipeline:**
- Problem: No `.github/workflows/`, no `.gitlab-ci.yml`, no Husky hooks.
- Blocks: Build/lint/test enforcement.

**No linter/formatter configured:**
- Problem: No `.eslintrc*`, `.prettierrc*`, or `biome.json`.
- Blocks: Consistent code style; catching unused vars, no-unused-imports, react-hooks/exhaustive-deps issues.

**No production build configuration / deployment story:**
- Problem: `vite.config.ts` builds the extension only for one config; no env-based base URL; `package.json` has no `start`/`build:server` scripts for the backend.

**No telemetry / error reporting:**
- Problem: All errors land in `console.error`. No Sentry / Datadog / Supabase logging.

**No structured logging on the backend:**
- Problem: `console.log`/`console.error` only.

## Test Coverage Gaps

**Everything — there are zero tests.** Highest-priority gaps:

**Authentication flow (`src/lib/auth.ts`):**
- What's not tested: Sign-up retry, Slash group creation failure, session restore, cache behavior, sign-out.
- Files: `src/lib/auth.ts`
- Risk: Auth is the gate to the whole product; silent breakage logs users out or pollutes data.
- Priority: High.

**Card autofill matching (`src/background/index.ts`):**
- What's not tested: `matchCandidatesToCards` (`src/background/index.ts:602-618`), `performAutofillNext` decision tree (single match / multiple matches / fallback), `sendFillCombined` response handling.
- Files: `src/background/index.ts:94-218,602-655`
- Risk: Wrong card filled = user submits wrong PAN.
- Priority: High.

**Server endpoints, especially `/api/cards/:id/full`, `/api/cards/create`, `/api/autofill/mark_used`, `/api/users/attach-slash-group`:**
- What's not tested: Authorization (currently absent), Slash API error pathways, cooldown calculation, audit log insertion.
- Files: `server/index.ts:175-396,399-450,453-564`
- Risk: Sensitive data exposure; corrupt usage counters.
- Priority: High.

**Selector save + map round-trip:**
- What's not tested: camelCase ⇄ lowercase mapping (`server/index.ts:112-141,785-800`), dedup behavior, foreign-key handling for `user-123` fallback.
- Priority: Medium.

**Network watcher injection (`src/content/networkWatcherInjected.ts`):**
- What's not tested: Rule matching, JSON path extraction, regex/substring fallback, idempotency.
- Risk: Breaks host-site network behavior on `<all_urls>`.
- Priority: High.

---

*Concerns audit: 2026-05-03*
