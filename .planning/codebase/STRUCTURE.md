# Codebase Structure

**Analysis Date:** 2026-05-03

## Directory Layout

```
chrome-card-ext/
├── public/                          # Static assets copied verbatim into dist/
│   └── manifest.json                # Chrome MV3 manifest
├── src/                             # Extension source (TypeScript + React)
│   ├── popup/                       # Browser-action popup (React app)
│   │   ├── index.html               # Vite HTML entry
│   │   ├── index.tsx                # React DOM root
│   │   └── App.tsx                  # Main popup UI + message senders
│   ├── background/
│   │   └── index.ts                 # MV3 service worker (message broker, API client)
│   ├── content/
│   │   ├── index.ts                 # Content script (ISOLATED world, runs on <all_urls>)
│   │   └── networkWatcherInjected.ts # Function injected into page MAIN world
│   ├── components/                  # React components used by popup
│   │   ├── AdminOptions.tsx         # Admin settings/profiles management
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   └── ConfigError.tsx
│   ├── lib/                         # Shared TS modules (popup + content + background)
│   │   ├── types.ts                 # User, Card, Address, SelectorProfile, NetworkRule, AuditLog
│   │   ├── constants.ts             # API_BASE_URL, SUPABASE_URL, storage keys
│   │   ├── supabase.ts              # Anon-key Supabase client for the extension
│   │   ├── auth.ts                  # Sign in/up/out, session persistence in chrome.storage.local
│   │   └── useAuth.ts               # React hook wrapping auth.ts
│   └── styles/
│       └── globals.css              # Tailwind base + globals
├── server/                          # Backend (Express + ts-node)
│   ├── index.ts                     # All REST routes, Slash + Supabase orchestration
│   └── supabase.ts                  # Service-role Supabase client
├── schema.sql                       # Postgres schema for Supabase
├── schema_reset.sql                 # Local-only reset script (untracked)
├── package.json                     # Scripts: build, dev, server, seed
├── vite.config.ts                   # Vite build config (3 entries: popup, background, content)
├── tsconfig.json                    # Extension/popup TS config (jsx: react-jsx, strict)
├── tsconfig.server.json             # Backend TS config (used by ts-node)
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Directory Purposes

**`public/`:**
- Purpose: Static assets that Vite copies untouched into `dist/`.
- Contains: `manifest.json` only.
- Key files: `public/manifest.json` (MV3 manifest declaring popup, service worker `background.js`, content script `content.js`, `web_accessible_resources` for `assets/*`, `commands.autofill-next` shortcut).

**`src/popup/`:**
- Purpose: React 19 app rendered inside the browser-action popup.
- Contains: HTML entry, React root, top-level `App` component.
- Key files: `src/popup/index.html`, `src/popup/index.tsx`, `src/popup/App.tsx`.

**`src/background/`:**
- Purpose: MV3 service worker; central message broker between popup, content, and Express API.
- Key files: `src/background/index.ts` (builds to `dist/background.js`).

**`src/content/`:**
- Purpose: Page-side scripts. `index.ts` runs in the extension's ISOLATED world; `networkWatcherInjected.ts` is `executeScript`-injected into MAIN world.
- Key files: `src/content/index.ts`, `src/content/networkWatcherInjected.ts`.

**`src/components/`:**
- Purpose: Reusable popup components.
- Contains: Auth screens (`Login.tsx`, `Signup.tsx`), `AdminOptions.tsx` (large — 832 lines — owns selector/network/settings management UI), `ConfigError.tsx`.

**`src/lib/`:**
- Purpose: Modules shared across popup/content/background and the seed script. No Node-only code.
- Key files: `src/lib/types.ts` (the canonical TS shapes; **also imported by the backend** via `../src/lib/types`), `src/lib/auth.ts`, `src/lib/supabase.ts`, `src/lib/constants.ts`, `src/lib/useAuth.ts`.

**`src/styles/`:**
- Purpose: Tailwind entry CSS.
- Key files: `src/styles/globals.css` (imported by `src/popup/index.tsx`).

**`server/`:**
- Purpose: Express backend running on `localhost:3000`; proxies the Slash API and uses Supabase service role.
- Key files: `server/index.ts`, `server/supabase.ts`. (`server/seed.ts` is referenced by `npm run seed` but may live elsewhere.)

**`.planning/`:**
- Purpose: GSD planning artifacts (this directory).
- Generated: Yes (by `/gsd-*` commands).
- Committed: Yes.

**`dist/`:**
- Purpose: Vite build output loaded by Chrome's "Load unpacked".
- Generated: Yes (`vite build`).
- Committed: No (gitignored).

## Key File Locations

**Entry Points:**
- `public/manifest.json`: Chrome extension manifest (action popup, service_worker, content_scripts).
- `src/popup/index.html`: Popup HTML, declared as Vite input.
- `src/popup/index.tsx`: React root mount.
- `src/background/index.ts`: Service worker entry (Vite input → `dist/background.js`).
- `src/content/index.ts`: Content script entry (Vite input → `dist/content.js`).
- `server/index.ts`: Express app + `app.listen(3000)`.

**Configuration:**
- `vite.config.ts`: Three Rollup inputs, output `[name].js` so manifest can reference `background.js`/`content.js` directly.
- `tsconfig.json`: Extension TS (`jsx: react-jsx`, `strict`, `types: ["chrome"]`, includes `src`).
- `tsconfig.server.json`: Backend TS for ts-node.
- `tailwind.config.js`, `postcss.config.js`: Styling pipeline.
- `package.json`: Scripts and dependencies.
- `.env`: Holds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SLASH_API_KEY`, `SLASH_ACCOUNT_ID`, `SLASH_API_BASE_URL`, `SLASH_API_VAULT_URL` (file present but never read by tooling).

**Core Logic:**
- `src/background/index.ts`: Autofill orchestration (`performAutofillNext`), all `fetch` calls to the Express API, `chrome.scripting.executeScript` for the MAIN-world watcher.
- `src/content/index.ts`: `fillCombined`, `findCardTextCandidates`, `getCssSelector`, in-page modal/loading UI.
- `src/lib/auth.ts`: Manual Supabase session persistence in `chrome.storage.local`, Slash group provisioning during signup.
- `server/index.ts`: All REST routes, `mapSlashCardToAppCard`, `SELECTOR_DB_FIELDS`, address bulk import.

**Database:**
- `schema.sql`: Source of truth for Supabase tables (`users`, `addresses`, `selector_profiles`, `network_profiles`, `settings`, `audit_logs`).

**Testing:**
- None. `package.json` `test` script exits with error.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `AdminOptions.tsx`, `Login.tsx`).
- Non-component TS modules: `camelCase.ts` (e.g., `useAuth.ts`, `networkWatcherInjected.ts`, `supabase.ts`).
- Entry files: lowercase `index.ts` / `index.tsx` / `index.html` per directory.

**Directories:**
- Lowercase, single-word where possible (`popup`, `background`, `content`, `lib`, `components`, `styles`, `server`, `public`).

**TypeScript identifiers:**
- Interfaces: `PascalCase` (`User`, `Card`, `SelectorProfile`, `NetworkRule`).
- Functions/variables: `camelCase`.
- Chrome message types: `SCREAMING_SNAKE_CASE` strings (e.g., `GET_CARDS`, `AUTOFILL_NEXT`, `FILL_COMBINED`).
- Express routes: kebab-case path segments, camelCase resource names where multi-word (`/api/selectorProfiles`, `/api/networkProfiles`, `/api/autofill/mark_used` — `mark_used` is the inconsistent snake_case outlier).

**Database columns:**
- Lowercase, no separators for selector arrays (`cardnumberselectors`, `cardexpiryselectors`, …).
- snake_case for everything else (`slash_group_id`, `last_used`, `usage_count`, `excluded_until`, `created_by`).
- Mapping between TS camelCase and DB lowercase happens in `server/index.ts` (`SELECTOR_DB_FIELDS` and `mapDbRowToSelectorProfile`).

## Where to Add New Code

**New popup feature / screen:**
- Component: `src/components/<Feature>.tsx`.
- Hook into: `src/popup/App.tsx` (top-level state and tab switching).
- Shared types: `src/lib/types.ts`.
- API call: send a message to background (`chrome.runtime.sendMessage({ type: 'NEW_TYPE', payload })`), do not `fetch` directly from the popup. Auth-related fetches are the exception (see `src/lib/auth.ts`).

**New background message / API call:**
- Add a `if (message.type === 'NEW_TYPE') { ...; return true; }` block in `src/background/index.ts`'s `chrome.runtime.onMessage.addListener`.
- Use `fetch('http://localhost:3000/api/...')` (matching existing pattern) **or**, preferably, switch to `API_BASE_URL` from `src/lib/constants.ts`.

**New Express route:**
- Add `app.<verb>('/api/...', async (req, res) => {...})` in `server/index.ts`.
- For Supabase access, use `import { supabase } from './supabase'` (service role).
- For Slash API access, use `fetch(`${SLASH_API_BASE_URL}/...`, { headers: { 'X-API-Key': SLASH_API_KEY } })` and translate via a `map…` helper.
- Add the corresponding TS type to `src/lib/types.ts` (the backend imports from there: `import { Card, ... } from "../src/lib/types"`).

**New Supabase table / column:**
- Update `schema.sql`.
- If selector-style with case mismatch, update `SELECTOR_DB_FIELDS` in `server/index.ts:112` and `mapDbRowToSelectorProfile` at `:126`.
- Add corresponding TS interface to `src/lib/types.ts`.

**New autofill field type (e.g., email):**
- Manifest context menu: add `chrome.contextMenus.create(...)` in `src/background/index.ts` `onInstalled` (`:6`).
- Content script mapping: extend `handleFieldMapping` switch in `src/content/index.ts:80`.
- Shared shape: add `<field>Selectors: string[]` to `SelectorProfile` in `src/lib/types.ts`.
- Backend: add entry to `SELECTOR_DB_FIELDS` (`server/index.ts:112`), update `mapDbRowToSelectorProfile` and the if-ladder in `POST /api/selectorProfiles` (`:742`).
- DB: add `<field>selectors text[]` column in `schema.sql`.
- Fill logic: extend `fillAddressFields`/`fillCardFields` in `src/content/index.ts:422`.

**New page-context behavior (MAIN world):**
- Put a pure function in `src/content/` and pass it via `chrome.scripting.executeScript({ world: 'MAIN', func, args })` from background (see `INJECT_NETWORK_WATCHER` handler at `src/background/index.ts:466`).
- The function must be self-contained — it cannot reference module-level imports at runtime; types are erased.

**Shared utilities:**
- Cross-process pure helpers: `src/lib/`.
- Backend-only helpers: top of `server/index.ts` (no `server/lib/` exists yet).

## Special Directories

**`dist/`:**
- Purpose: Vite build output loaded by Chrome.
- Generated: Yes (`npm run build`).
- Committed: No (`.gitignore`).

**`node_modules/`:**
- Purpose: npm dependencies.
- Committed: No.

**`.planning/codebase/`:**
- Purpose: This file and other GSD codebase-mapping documents.
- Generated: Yes.
- Committed: Yes.

**`public/`:**
- Purpose: Static assets that Vite copies verbatim into `dist/` (manifest only at present).
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-05-03*
