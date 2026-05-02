# External Integrations

**Analysis Date:** 2026-05-03

## APIs & External Services

**Card Issuance / Vault — Slash:**
- `https://api.joinslash.com` — Card group and card CRUD operations.
  - Default base URL configured in `server/index.ts:7` (`SLASH_API_BASE_URL`).
  - SDK/Client: native `fetch` from Node 18+ runtime. No SDK package; raw HTTP.
  - Auth: `X-API-Key` header; secret from `SLASH_API_KEY` env var (`server/index.ts:9`).
  - Endpoints used:
    - `POST /card-group` — Create a card group at signup (`server/index.ts:215`).
    - `GET  /card?filter:cardGroupId={id}` — List cards (`server/index.ts:269`).
    - `GET  /card/{id}` — Fetch a single card for hydration polling and usage updates (`server/index.ts:376`, `:476`).
    - `POST /card` — Create a virtual card; requires `SLASH_ACCOUNT_ID` (`server/index.ts:336`).
    - `PATCH /card/{id}` — Update `userData` for usage tracking and cooldowns (`server/index.ts:497`).
- `https://vault.joinslash.com` — PCI-scoped vault for sensitive card material.
  - Default base URL configured in `server/index.ts:8` (`SLASH_API_VAULT_URL`).
  - Endpoint used: `GET /card/{id}?include_pan=true&include_cvv=true` — Returns full PAN/CVV for autofill (`server/index.ts:413`).
  - Same `X-API-Key` auth.

**Backend API (own service):**
- Local Express server at `http://localhost:3000` (hard-coded in `src/lib/constants.ts:2` and direct `fetch` calls).
  - Consumed by extension background worker (`src/background/index.ts:285,318,330,352,451,529`), popup admin UI (`src/components/AdminOptions.tsx:103-482`), and auth flow (`src/lib/auth.ts:30,274`).
  - No auth header on inter-service calls; relies on localhost trust boundary.

## Data Storage

**Databases:**
- Supabase (managed PostgreSQL) — Primary application data store.
  - Connection: `SUPABASE_URL` + service role key on the server (`server/supabase.ts:6-14`); `VITE_SUPABASE_URL` + anon key in the extension (`src/lib/supabase.ts:9`).
  - Client: `@supabase/supabase-js` ^2.86.0 (`createClient`).
  - Tables (defined in `schema.sql`): `users`, `settings`, `selector_profiles`, `network_profiles`, `addresses`, `audit_logs`. Auth users live in Supabase-managed `auth.users`; a `handle_new_user()` trigger seeds `public.users`.
  - Extensions: `pgcrypto` (for `gen_random_uuid()`) created in `schema.sql:2`.
  - RLS: Enabled on `users`, `selector_profiles`, `network_profiles`, `addresses`. Backend uses service-role key to bypass RLS for admin operations.

**File Storage:**
- None. No Supabase Storage, S3, or local upload handlers detected.

**Caching:**
- In-memory only — `cachedUser` / `currentUserPromise` module-level cache in `src/lib/auth.ts:18-19`. No Redis/Memcached.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (email/password).
  - Sign-in: `supabase.auth.signInWithPassword` (`src/lib/auth.ts:191`).
  - Sign-up: `supabase.auth.signUp` (`src/lib/auth.ts:257`), followed by Slash group creation and a server-side update to `users.slash_group_id` via `POST /api/users/attach-slash-group` (`server/index.ts:175`).
  - Session: persisted manually to `chrome.storage.local` under key `supabase_session` (`src/lib/auth.ts:226`); auto-refresh and built-in persistence are explicitly disabled in both clients (`src/lib/supabase.ts:11-14`, `server/supabase.ts:15-18`).
  - Roles: `admin` | `user` enforced at the database level via RLS policies (e.g., `network_profiles` admin-only writes in `schema.sql:118-146`).

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry/Datadog/Rollbar SDK present.

**Logs:**
- `console.log` / `console.warn` / `console.error` throughout `server/index.ts`, `src/background/index.ts`, `src/lib/auth.ts`. No structured logger.
- `audit_logs` table records autofill events with details JSON (`server/index.ts:541`, schema in `schema.sql:202-210`).

## CI/CD & Deployment

**Hosting:**
- Backend: not configured for any platform; intended to run locally via `npm run server`.
- Extension: distributed as an unpacked `dist/` folder loaded into Chrome (per README step 5). No Chrome Web Store packaging script.

**CI Pipeline:**
- None detected. No `.github/`, `.gitlab-ci.yml`, `.circleci/`, or other CI config in the repo root.

## Environment Configuration

**Required env vars (server-side, read in `server/`):**
- `SUPABASE_URL` (`server/supabase.ts:6`)
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY` (`server/supabase.ts:8`)
- `SLASH_API_KEY` (`server/index.ts:9`)
- `SLASH_ACCOUNT_ID` (`server/index.ts:10`)
- `SLASH_API_BASE_URL` (optional override, default `https://api.joinslash.com`)
- `SLASH_API_VAULT_URL` (optional override, default `https://vault.joinslash.com`)

**Required env vars (client-side, inlined by Vite):**
- `VITE_SUPABASE_URL` (`src/lib/constants.ts:6`)
- `VITE_SUPABASE_ANON_KEY` (`src/lib/constants.ts:7`)

**Secrets location:**
- `.env` at repo root (gitignored at `.gitignore:73-75`). Loaded by `dotenv.config()` in `server/supabase.ts:4`. `.env` file existence is not verified here; never read by this analysis.

## Webhooks & Callbacks

**Incoming:**
- No webhook receiver routes defined in `server/index.ts`. All routes are request/response REST under `/api/*`.

**Outgoing:**
- None. Slash API calls are synchronous fetches initiated from REST handlers; no event publication or callback registration.

## Browser Integrations

**Chrome Extensions API surface (Manifest V3, `public/manifest.json`):**
- `chrome.storage.local` — Session and current-user persistence (`src/lib/auth.ts:101,226,313`, `src/content/index.ts:98`).
- `chrome.contextMenus` — 11 right-click menu items registered for selector mapping (`src/background/index.ts:10-65`).
- `chrome.commands` — `Ctrl+Shift+F` / `MacCtrl+Shift+F` keyboard shortcut for "Autofill Next Card" (`public/manifest.json:36-44`, handled in `src/background/index.ts:253`).
- `chrome.runtime.onMessage` — Message routing between popup/content/background (`src/background/index.ts:272`, `src/content/index.ts:17`).
- `chrome.scripting` — Permission declared in `public/manifest.json:9` for programmatic injection.
- Network interception: page-context `window.fetch` monkey-patch in `src/content/networkWatcherInjected.ts:100-101` for name detection from in-page network calls (driven by `network_profiles` rules).

**Host permissions:**
- `http://*/*`, `https://*/*` — Extension may run on any URL (`public/manifest.json:12-15`).

---

*Integration audit: 2026-05-03*
