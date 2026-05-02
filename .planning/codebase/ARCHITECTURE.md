<!-- refreshed: 2026-05-03 -->
# Architecture

**Analysis Date:** 2026-05-03

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Chrome Extension (MV3)                             │
├──────────────────────┬─────────────────────────┬────────────────────────┤
│  Popup (React 19)    │  Background SW          │  Content Script        │
│  `src/popup/App.tsx` │  `src/background/       │  `src/content/         │
│  `src/popup/         │   index.ts`             │   index.ts`            │
│   index.tsx`         │  (service_worker module)│  (run_at:              │
│                      │                         │   document_start,      │
│                      │                         │   matches: <all_urls>) │
└──────────┬───────────┴───────────┬─────────────┴──────────┬─────────────┘
           │                       │                         │
           │ chrome.runtime        │ chrome.tabs.sendMessage │ window.postMessage
           │ .sendMessage          │ chrome.scripting        │ (MAIN world)
           │                       │ .executeScript          │
           ▼                       ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              MAIN-world injected script (page context)                   │
│              `src/content/networkWatcherInjected.ts`                     │
│              (patches fetch/XHR to detect cardholder name)               │
└─────────────────────────────────────────────────────────────────────────┘
           │
           │  fetch() to http://localhost:3000
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Express Backend (ts-node)                                 │
│                `server/index.ts`  (PORT 3000)                            │
│                CORS enabled, JSON body parser (50mb)                     │
└──────────┬──────────────────────────────────────────────┬───────────────┘
           │                                               │
           ▼                                               ▼
┌──────────────────────────────────┐    ┌────────────────────────────────┐
│   Supabase (PostgreSQL + Auth)   │    │   Slash API (external)         │
│   service_role key, RLS bypassed │    │   api.joinslash.com            │
│   `server/supabase.ts`           │    │   vault.joinslash.com          │
│   tables: users, addresses,      │    │   X-API-Key header             │
│   selector_profiles,             │    │   (cards, card-groups, vault)  │
│   network_profiles, settings,    │    │                                │
│   audit_logs                     │    │                                │
└──────────────────────────────────┘    └────────────────────────────────┘
           ▲
           │  anon key (direct from extension popup for auth only)
           │
           └─── `src/lib/supabase.ts` (Supabase JS client in extension)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Popup UI | React app shown in browser action; vault list, autofill triggers, admin options | `src/popup/App.tsx`, `src/popup/index.tsx` |
| Background service worker | Central message broker; calls Express API; orchestrates autofill flow; manages context menus and keyboard shortcuts | `src/background/index.ts` |
| Content script | DOM interaction on every page; field mapping via context menu; selector-based fill; card-number candidate scan; renders selection modal/loading pill | `src/content/index.ts` |
| Network watcher (injected, MAIN world) | Patches `fetch`/XHR in page context to extract cardholder name from network responses, posts via `window.postMessage` | `src/content/networkWatcherInjected.ts` |
| Auth library | Supabase auth client, manual session persistence in `chrome.storage.local`, Slash group provisioning on signup | `src/lib/auth.ts`, `src/lib/useAuth.ts`, `src/lib/supabase.ts` |
| Express server | REST API for cards, addresses, selector/network profiles, settings; proxies Slash API; bypasses RLS via service role | `server/index.ts` |
| Supabase service client | Service-role Supabase client used by backend | `server/supabase.ts` |

## Pattern Overview

**Overall:** Chrome Manifest V3 extension (popup + service worker + content script) with a thin Express/ts-node backend acting as a Slash API proxy and Supabase service-role gateway.

**Key Characteristics:**
- Three-process extension model (popup React app, MV3 service worker, per-page content script) communicating via `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.
- Backend is a single-file Express app (`server/index.ts`) that fans out to Supabase (service role) and the Slash API. It does not authenticate callers — it trusts the local extension via `http://localhost:3000`.
- Supabase Auth is consumed directly by the extension (anon key, manual session persisted to `chrome.storage.local`); user/role/group rows live in a `users` Postgres table that the backend mutates with the service role.
- Sensitive card data (`pan`, `cvv`) is fetched on demand from a separate Slash vault host (`SLASH_API_VAULT_URL`) and never persisted server-side.
- Cardholder name is detected at page time by injecting a MAIN-world script that patches `fetch`/XHR according to per-domain `NetworkRule[]` profiles.

## Layers

**Extension UI (Popup):**
- Purpose: User-facing vault and admin surface, rendered inside the browser action popup.
- Location: `src/popup/`, `src/components/`
- Contains: React 19 components, Tailwind styles, `useAuth` hook.
- Depends on: `src/lib/auth.ts`, `src/lib/supabase.ts`, `chrome.runtime.sendMessage` to background.
- Used by: End user via toolbar icon (`action.default_popup` in `public/manifest.json`).

**Extension Background (Service Worker):**
- Purpose: Long-lived (per MV3 lifecycle) message broker; sole owner of `fetch` calls to the Express API for non-auth flows.
- Location: `src/background/index.ts`
- Contains: Message router, autofill orchestration (`performAutofillNext`, `AUTOFILL_CARD`), context-menu setup, keyboard command handler, `chrome.scripting.executeScript` injection of the MAIN-world watcher.
- Depends on: `src/content/networkWatcherInjected.ts` (for `func` arg to `executeScript`), `src/lib/types.ts`, Express API at `http://localhost:3000`.
- Used by: Popup, content script, Chrome runtime (commands, contextMenus, onInstalled).

**Extension Content (Page Bridge + ISOLATED world):**
- Purpose: DOM access on `<all_urls>` at `document_start`; selector-based autofill, candidate scanning, in-page modals.
- Location: `src/content/index.ts`
- Contains: Context-menu click handler, `fillCombined`/`fillCardFields`/`fillAddressFields`, card-number text walker, card-selection modal, autofill loading pill, network watcher bootstrap.
- Depends on: `chrome.runtime.sendMessage` to background; `window.postMessage` from injected watcher.
- Used by: Background (`chrome.tabs.sendMessage`), page DOM events.

**Page MAIN world (Injected Network Watcher):**
- Purpose: Read-only observation of in-page `fetch`/XHR responses to extract cardholder name. Cannot use `chrome.*` APIs.
- Location: `src/content/networkWatcherInjected.ts`
- Contains: `networkWatcherMain(rules)` — installs idempotent patches on `window.fetch` and `XMLHttpRequest`.
- Depends on: `NetworkRule` shape from `src/lib/types.ts` (compiled into the injected function).

**Backend API:**
- Purpose: Single Express app that proxies the Slash API, persists Supabase rows with the service role, and merges the two domains into the app's `Card` shape.
- Location: `server/index.ts`, `server/supabase.ts`
- Contains: Auth/user routes (`/api/auth/user/:userId`, `/api/users/attach-slash-group`), card routes (`/api/cards`, `/api/cards/create`, `/api/cards/:id/full`, `/api/autofill/mark_used`), settings, selector profiles, network profiles, addresses (with background bulk import).
- Depends on: `@supabase/supabase-js` (service role), Slash REST API, env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_KEY`, `SLASH_API_KEY`, `SLASH_ACCOUNT_ID`, `SLASH_API_BASE_URL`, `SLASH_API_VAULT_URL`.

**Data Stores:**
- Supabase Postgres tables: `users`, `addresses`, `selector_profiles`, `network_profiles`, `settings`, `audit_logs` (see `schema.sql`).
- Slash API: source of truth for `Card` records (the app's `Card` is derived from `SlashCard` via `mapSlashCardToAppCard` in `server/index.ts:31`). User-specific card metadata (labels, lastUsed, usageCount, excludedUntil, createdByUserId) is stored in the Slash card's `userData` blob.
- Chrome storage (`chrome.storage.local`): keys `supabase_session` (manual access/refresh tokens) and `currentUser` (User snapshot).

## Data Flow

### Primary Request Path — "Generate New Card" from popup

1. Popup button click → `handleGenerateCard` (`src/popup/App.tsx:202`) sends `CREATE_CARD` message with `userId`, `groupId`.
2. Background `onMessage` handler matches `CREATE_CARD` (`src/background/index.ts:325`) and `fetch`es `POST http://localhost:3000/api/cards/create`.
3. Express handler (`server/index.ts:309`) builds a Slash request body and `POST`s `${SLASH_API_BASE_URL}/card` with `X-API-Key`.
4. Server polls `${SLASH_API_BASE_URL}/card/:id` up to 6× (500ms) until `last4`/expiry are populated (`server/index.ts:362`).
5. `mapSlashCardToAppCard` transforms response, strips `pan`/`cvv`, returns sanitized `Card` JSON.
6. Background forwards `{ card }` to popup callback; popup re-fetches the card list via `GET_CARDS`.

### Autofill Path — "Autofill Next" / Ctrl+Shift+F

1. Trigger: popup `handleAutofillNext` (`src/popup/App.tsx:238`) **or** keyboard command `autofill-next` (`src/background/index.ts:253`) reads `currentUser` from `chrome.storage.local`.
2. Background `performAutofillNext` (`src/background/index.ts:94`):
   - `setAutofillLoading(true)` → content script displays pill.
   - `fetchDetectedName(tabId)` ← latest name posted by injected watcher.
   - `scanForCardCandidates(tabId)` → content script walks text nodes for 12+ digit sequences (`findCardTextCandidates` in `src/content/index.ts:557`).
   - Parallel `fetchCards` and `fetchAddresses` against Express.
   - `matchCandidatesToCards` joins candidates by `last4`. If multiple, `promptCardSelection` shows modal in content script.
   - `fetchFullCard` → `GET /api/cards/:id/full` (Slash vault endpoint with `include_pan=true&include_cvv=true`).
   - `sendFillCombined` → content script `fillCombined` loads `SelectorProfile` for domain via background and writes values into matched inputs.
   - `markAutofillUsed` → `POST /api/autofill/mark_used` patches Slash `userData` and inserts `audit_logs` row.
3. Background `setAutofillLoading(false)` and replies to popup with success/fallback flags.

### Auth/Signup Flow

1. Popup `Signup` calls `signUp` (`src/lib/auth.ts:254`) → `supabase.auth.signUp` (anon key, direct from extension).
2. `fetchUserProfileWithRetry` polls `users` row created by Supabase trigger.
3. `createSlashGroup` → `POST /api/slash/card-groups` on Express, which calls Slash `POST /card-group`.
4. `POST /api/users/attach-slash-group` writes `slash_group_id` onto the user row using the service role (bypassing RLS).
5. On `signIn`, session tokens are persisted to `chrome.storage.local` under `supabase_session`; `currentUser` snapshot is also written for the keyboard-shortcut path.

### Network-name Detection Flow

1. Content script load (`src/content/index.ts:10`) calls `initializeNetworkDetection` → `GET_NETWORK_PROFILE` to background.
2. Background hits `GET /api/networkProfiles?domain=...` → Supabase `network_profiles` row.
3. Content script sends `INJECT_NETWORK_WATCHER` with `rules`; background uses `chrome.scripting.executeScript({ world: 'MAIN', func: networkWatcherMain, args: [rules] })`.
4. Watcher patches `fetch`/XHR; on a matching response it `window.postMessage({ type: 'SLASH_NAME_DETECTED', name })`.
5. Content script's `handleDetectedNameMessage` stores `latestDetectedName`, later supplied to autofill via `GET_DETECTED_NAME`.

**State Management:**
- React local state via `useState`/`useEffect` in popup; no global store.
- Auth state shared via in-module `cachedUser` + a manual listener array in `src/lib/auth.ts`.
- Cross-process state shared via `chrome.storage.local` (`currentUser`, `supabase_session`).
- Background module-level singletons: none persisted across SW restarts (MV3 SW may be torn down — handlers re-register on each `onMessage`).

## Key Abstractions

**`Card` (app) vs `SlashCard` (vendor):**
- Purpose: Internal `Card` is the popup/extension shape; `SlashCard` is the Slash vendor payload. `mapSlashCardToAppCard` (`server/index.ts:31`) is the only translation point.
- Pattern: Server-side adapter; Slash `userData` blob is treated as a key/value side-channel for app-owned fields (`labels`, `usageCount`, `lastUsed`, `excludedUntil`, `createdByUserId`).

**`SelectorProfile`:**
- Purpose: Per-domain map from field type (`cardNumber`, `address1`, …) to an array of CSS selectors collected via right-click "Set as ___ Field".
- Files: `src/lib/types.ts:26`, `server/index.ts:99` (`SELECTOR_DB_FIELDS` snake-case mapping), `src/content/index.ts:80` (`handleFieldMapping`).
- Pattern: Camel-case in TS, lowercase columns in Postgres; explicit mapping table to bridge.

**`NetworkRule` / `NetworkProfile`:**
- Purpose: Declarative description of which page-level requests carry the cardholder name, where it is in the JSON.
- Files: `src/lib/types.ts:43`, `src/content/networkWatcherInjected.ts:3`.

**Message-type protocol:**
- Single discriminator (`message.type`) on `chrome.runtime.sendMessage`. Known types include `GET_CARDS`, `GET_CARD_FULL`, `GET_ADDRESSES`, `CREATE_CARD`, `SAVE_SELECTOR`, `GET_SELECTORS`, `MARK_USED`, `AUTOFILL_NEXT`, `AUTOFILL_CARD`, `GET_NETWORK_PROFILE`, `INJECT_NETWORK_WATCHER`, `CONTEXT_MENU_CLICK`, `FILL_FIELDS`, `FILL_FOR_CONTEXT`, `FILL_COMBINED`, `SCAN_FOR_CARD_NUMBERS`, `GET_DETECTED_NAME`, `SHOW_CARD_SELECTION_MODAL`, `AUTOFILL_LOADING`.
- Pattern: Handlers `return true` to keep `sendResponse` alive for async work — required by Chrome runtime.

## Entry Points

**Popup UI:**
- Location: `src/popup/index.html` → `src/popup/index.tsx` → `src/popup/App.tsx`
- Triggers: User clicks the toolbar icon (`action.default_popup` in `public/manifest.json`).
- Responsibilities: Render auth screens or vault; talk to background.

**Background service worker:**
- Location: `src/background/index.ts` (built to `dist/background.js`, registered as `background.service_worker` with `"type": "module"`).
- Triggers: Extension install, Chrome runtime messages, `chrome.commands` (`autofill-next`), `chrome.contextMenus.onClicked`.
- Responsibilities: All HTTP traffic to the Express API for non-auth flows; orchestrate autofill; inject MAIN-world watcher.

**Content script:**
- Location: `src/content/index.ts` (built to `dist/content.js`, declared in `content_scripts` for `<all_urls>`, `run_at: document_start`).
- Triggers: Every page load; messages from background; right-click context menu via stored `lastClickedElement`.
- Responsibilities: DOM read/write, modals, candidate scanning, network watcher bootstrap.

**Express server:**
- Location: `server/index.ts`
- Triggers: `npm run server` → `nodemon` runs `ts-node --project tsconfig.server.json server/index.ts`.
- Responsibilities: REST API on `http://localhost:3000`; long-lived process with `setInterval(()=>{}, 1<<30)` keep-alive (`server/index.ts:1017`).

**Seed script:**
- Location: `server/seed.ts` (referenced by `npm run seed`; file may exist outside the inspected tree).

## Architectural Constraints

- **MV3 service worker lifecycle:** Background script is not persistent. All in-memory state in `src/background/index.ts` (e.g., open `Promise`s) can disappear at any time. Always re-derive state from `chrome.storage.local` or the API.
- **Hard-coded API origin:** Background uses literal `http://localhost:3000` strings (`src/background/index.ts:285`, `:330`, `:451`, `:535`, `:587`). Popup auth uses `API_BASE_URL` from `src/lib/constants.ts`. These are inconsistent — background ignores `API_BASE_URL`.
- **Single Express process, no auth:** `server/index.ts` does not verify user identity on any route. It accepts `userId`/`role`/`groupId` from the client. Safe only because it binds to localhost; would be unsafe if exposed.
- **Service-role key in backend:** `server/supabase.ts` uses the service role and bypasses RLS. The backend is the only enforcement layer for cross-tenant access (`role === "user"` filter in `/api/cards` and `/api/cards/:id/full`).
- **Slash `userData` is the source of truth for app metadata:** Concurrent `mark_used` calls race-read/write the blob (`server/index.ts:476`–`:504`). No optimistic concurrency.
- **Field-name case mismatch:** TS uses camelCase (`cardNumberSelectors`); Postgres columns use lowercase no-separator (`cardnumberselectors`). The mapping is duplicated in `SELECTOR_DB_FIELDS` and inline in `POST /api/selectorProfiles` (`server/index.ts:742`).
- **No tests:** `package.json` test script exits with error.
- **Global state in injected watcher:** `window.__slashNetworkWatcherInstalled` guards against double-install per page (`src/content/networkWatcherInjected.ts:7`).

## Anti-Patterns

### Per-route `fetch` literals scattered across the background script

**What happens:** `src/background/index.ts` builds `fetch('http://localhost:3000/api/...')` calls inline in 7+ places.
**Why it's wrong:** Changing the API origin (e.g., for a non-localhost backend) requires editing every site; the popup-side `API_BASE_URL` constant is not used here.
**Do this instead:** Import `API_BASE_URL` from `src/lib/constants.ts` and centralize an `apiFetch(path, init)` helper in `src/lib/` shared with the popup.

### Selector field-type if/else chain

**What happens:** `POST /api/selectorProfiles` (`server/index.ts:742`–`:768`) has a long `if (fieldType === 'cardNumber') ... else if (fieldType === 'cardExpiry') ...` ladder duplicating `SELECTOR_DB_FIELDS`.
**Why it's wrong:** Adding a new field type requires changes in three places: `SELECTOR_DB_FIELDS`, the if-ladder, and the camelCase response mapper at `server/index.ts:785`.
**Do this instead:** Use the existing `SELECTOR_DB_FIELDS` table to look up the column name and the `mapDbRowToSelectorProfile` helper for the response.

### Optimistic Slash `userData` patch without re-read

**What happens:** `/api/autofill/mark_used` reads the card, increments `usageCount`, and PATCHes the entire `userData` blob (`server/index.ts:476`–`:504`).
**Why it's wrong:** Two concurrent autofills can lose an increment, or clobber a field added by another writer.
**Do this instead:** Treat `userData` writes as last-writer-wins for now and document the limitation; longer-term, move counters into Supabase where Postgres can serialize the update.

### Backend trusts client-supplied `role`/`userId`

**What happens:** `/api/cards`, `/api/cards/:id/full`, `/api/autofill/mark_used`, `/api/users/attach-slash-group` all accept `userId`/`role` from the request body or query (`server/index.ts:255`, `:401`, `:454`, `:175`).
**Why it's wrong:** Anyone reaching the API can claim admin and read any group's cards.
**Do this instead:** Pass the Supabase access token from the extension and verify it server-side with `supabase.auth.getUser(token)` before honoring `role`/`groupId`.

## Error Handling

**Strategy:** Each Express route returns `{ error: string }` with a status code (`400`, `404`, `500`, `502`); upstream Slash failures are surfaced as `502`. Background handlers forward errors to popup via `sendResponse({ error })`. Popup logs to console and clears loading state.

**Patterns:**
- `try/catch` around Express handler bodies with `console.error("[/api/path] ...")` prefixes.
- `chrome.runtime.lastError` is checked after every `chrome.tabs.sendMessage`/`chrome.runtime.sendMessage` callback (e.g., `src/background/index.ts:512`, `src/popup/App.tsx:54`) to avoid unhandled errors when the tab/SW is unavailable.
- Popup uses `setTimeout` watchdogs (5s) to clear `loading` if background never responds (`src/popup/App.tsx:40`, `:79`, `:207`, `:243`, `:273`).

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` with `[Background]`, `[App]`, `[API]`, `[signUp]` etc. prefixes. No structured logger.

**Validation:** Per-route ad-hoc checks (`if (!name) return res.status(400)...`). No schema library (no Zod/Yup).

**Authentication:** Supabase Auth in the extension only. Backend has no auth middleware.

**CORS:** `app.use(cors())` with default open settings (`server/index.ts:154`). Body limit raised to 50mb to support `addresses/import`.

---

*Architecture analysis: 2026-05-03*
