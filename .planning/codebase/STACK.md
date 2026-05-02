# Technology Stack

**Analysis Date:** 2026-05-03

## Languages

**Primary:**
- TypeScript ^5.9.3 — Used for all source code in `src/` (extension) and `server/` (backend). Strict mode enabled (`tsconfig.json`).
- TSX/JSX (React 19) — UI components in `src/popup/`, `src/components/`.

**Secondary:**
- SQL (PostgreSQL dialect) — Database schema in `schema.sql` and `schema_reset.sql`.
- HTML — Single popup entry `src/popup/index.html`.
- CSS — Tailwind directives in `src/styles/globals.css`.
- JavaScript (CommonJS) — Tooling configs only: `tailwind.config.js`, `postcss.config.js`.

## Runtime

**Environment:**
- Node.js 16+ (per README) — Hosts the Express server and the Vite build pipeline.
- Chromium (Manifest V3) — Hosts the popup, background service worker, and content script. Configured in `public/manifest.json`.

**Package Manager:**
- npm — Lockfile present at `package-lock.json` (140 KB). No yarn/pnpm artifacts detected.

## Frameworks

**Core (Frontend / Extension):**
- React ^19.2.1 + React DOM ^19.2.1 — Popup UI rendered from `src/popup/index.tsx` via `ReactDOM.createRoot`.
- Tailwind CSS ^3.4.16 — Utility-first styling. Config: `tailwind.config.js` (content globs over `src/**/*.{js,jsx,ts,tsx,html}`), `postcss.config.js`.
- `tailwind-merge` ^3.4.0 + `clsx` ^2.1.1 — Class composition utilities used by components.
- `lucide-react` ^0.555.0 — Icon set used in popup/admin UI.
- Chrome Extensions API (Manifest V3) — `chrome.runtime`, `chrome.storage`, `chrome.contextMenus`, `chrome.commands`, `chrome.scripting` used across `src/background/index.ts` and `src/content/index.ts`. Type defs from `@types/chrome` ^0.1.32.

**Core (Backend):**
- Express ^5.2.1 — HTTP server in `server/index.ts` listening on port 3000.
- `cors` ^2.8.5 — Open CORS policy via `app.use(cors())` in `server/index.ts:154`.
- `body-parser` ^2.2.1 — Listed as dependency; actual JSON/urlencoded parsing uses Express built-ins (`express.json`, `express.urlencoded`) at `server/index.ts:155-156`.
- `dotenv` ^17.2.3 — Loads `.env` in `server/supabase.ts:4`.

**Testing:**
- None detected. `package.json` `test` script is the npm placeholder (`echo "Error: no test specified" && exit 1`). No `*.test.*` / `*.spec.*` files.

**Build/Dev:**
- Vite ^7.2.6 — Bundler. Config: `vite.config.ts` defines three Rollup inputs: `popup` (HTML), `background` (TS), `content` (TS) emitted as flat `[name].js` to `dist/`.
- `@vitejs/plugin-react` ^5.1.1 — React Fast Refresh / JSX transform.
- `ts-node` ^10.9.2 — Runs the Express server and seed script directly from TypeScript.
- `nodemon` ^3.1.11 — Watches `server/` for `.ts` changes (see `server` script in `package.json:10`).
- `autoprefixer` ^10.4.22 + `postcss` ^8.5.6 — Tailwind PostCSS pipeline.

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.86.0 — Used in both client (`src/lib/supabase.ts` with anon key) and server (`server/supabase.ts` with service-role key). Drives auth, RLS-protected data access, and admin writes.
- `react` / `react-dom` ^19.2.1 — Entire popup UI.
- `express` ^5.2.1 — All backend HTTP routes.

**Infrastructure:**
- `@types/chrome`, `@types/express`, `@types/cors`, `@types/node`, `@types/react`, `@types/react-dom` — TypeScript types for the runtime APIs.

## Configuration

**Environment:**
- `.env` file (gitignored via `.gitignore` lines 73-75) — loaded by `dotenv.config()` in `server/supabase.ts`. Vite-prefixed `VITE_*` variables are inlined at build time and consumed in `src/lib/constants.ts`.
- Required keys (per README and source):
  - `SUPABASE_URL` — Server-side Supabase project URL (`server/supabase.ts:6`).
  - `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_KEY` — Service-role key for backend (`server/supabase.ts:8`).
  - `VITE_SUPABASE_URL` — Client-side Supabase URL (`src/lib/constants.ts:6`).
  - `VITE_SUPABASE_ANON_KEY` — Client-side anon key (`src/lib/constants.ts:7`).
  - `SLASH_API_KEY` — Slash API authentication (`server/index.ts:9`).
  - `SLASH_ACCOUNT_ID` — Slash account scope (`server/index.ts:10`).
  - `SLASH_API_BASE_URL` — Default `https://api.joinslash.com` (`server/index.ts:7`).
  - `SLASH_API_VAULT_URL` — Default `https://vault.joinslash.com` (`server/index.ts:8`).

**Build:**
- `vite.config.ts` — Multi-entry Rollup config; outputs `popup.js`, `background.js`, `content.js` to `dist/` with hashed asset/chunk names.
- `tsconfig.json` — Strict TS for the extension. Targets `ES2020`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit: true`, includes `chrome` types, scope `src`.
- `tsconfig.server.json` — Extends root, switches to `module: commonjs`, `moduleResolution: node`, `noEmit: false`, `esModuleInterop: true`, `noImplicitAny: false`. Scope `server` and `src`.
- `tailwind.config.js` — Default theme, content scan over `src/**/*.{js,jsx,ts,tsx,html}`.
- `postcss.config.js` — Loads tailwindcss + autoprefixer.

## Platform Requirements

**Development:**
- Node.js 16+ and npm (per README "Prerequisites").
- Google Chrome (or Chromium) browser to load the unpacked extension from `dist/`.
- Supabase project (free tier acceptable per README) with `schema.sql` applied.
- Slash API credentials (`SLASH_API_KEY`, `SLASH_ACCOUNT_ID`) for card operations.

**Production:**
- Backend: any Node host capable of running `ts-node` (or compiled output) on a port reachable from the extension. Currently hard-coded to `http://localhost:3000` in `src/lib/constants.ts:2` and inline `fetch` calls (e.g., `src/background/index.ts:285`, `src/components/AdminOptions.tsx:103`).
- Database: Supabase-hosted PostgreSQL with `pgcrypto` extension and the schema from `schema.sql`.
- Browser: Chrome with developer-mode loading; no Web Store packaging detected.

---

*Stack analysis: 2026-05-03*
