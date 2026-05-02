# Coding Conventions

**Analysis Date:** 2026-05-03

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (e.g., `Login.tsx`, `Signup.tsx`, `AdminOptions.tsx`, `ConfigError.tsx`) in `src/components/`
- Top-level app shell: `App.tsx` in `src/popup/`
- React entry: lowercase `index.tsx` (e.g., `src/popup/index.tsx`)
- Non-component TS modules: `camelCase.ts` (e.g., `src/lib/useAuth.ts`, `src/lib/auth.ts`, `src/lib/supabase.ts`, `src/lib/constants.ts`, `src/lib/types.ts`, `src/content/networkWatcherInjected.ts`)
- Server modules: `camelCase.ts` (`server/index.ts`, `server/supabase.ts`)
- Static HTML: lowercase (`src/popup/index.html`)
- CSS: lowercase, single global file at `src/styles/globals.css`
- Tailwind/PostCSS configs use `.js` not `.ts` (`tailwind.config.js`, `postcss.config.js`)

**Functions:**
- `camelCase` for all functions, including React component handlers (`fetchCards`, `handleGenerateCard`, `handleAutofillNext`, `formatExpiry`, `formatDateSafe` in `src/popup/App.tsx`)
- Custom hooks prefixed with `use` (`useAuth` in `src/lib/useAuth.ts`)
- React component functions: `PascalCase` (`Login`, `Signup`, `AdminOptions`, `ConfigError`, `App`)
- Server helpers: `camelCase` (`mapSlashCardToAppCard`, `attachCreatorEmails`, `parseNumber` in `server/index.ts`)
- Event handlers prefixed `handle*` (e.g., `handleSubmit`, `handleLogout`, `handleAutofillCard`)

**Variables:**
- `camelCase` for locals and props (e.g., `searchQuery`, `cardDetails`, `authView`, `pairedAddress`)
- `SCREAMING_SNAKE_CASE` for module-level constants (e.g., `API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_STORAGE_KEY`, `SESSION_STORAGE_KEY`, `SLASH_API_BASE_URL` in `src/lib/constants.ts` and `server/index.ts`)
- Boolean state often prefixed with `is*` or `has*` (`isLoading`, `hasAutofillCandidates`)

**Types:**
- `PascalCase` interfaces and types in `src/lib/types.ts` (`User`, `Card`, `SelectorProfile`, `NetworkRule`, `NetworkProfile`, `AuditLog`, `Address`)
- Interfaces preferred over type aliases for object shapes (e.g., `interface User`, `interface LoginProps`)
- Type aliases used for unions / string literals inside components (`type AuthView = "login" | "signup"` in `src/popup/App.tsx`; `type SelectorFieldKey = ...` in `src/components/AdminOptions.tsx`)
- Component prop types named `<Component>Props` and defined inline in the component file (`LoginProps` in `src/components/Login.tsx`)
- Database row shapes from Supabase typed inline as `any` rather than generated types (see `details: any` on `AuditLog` in `src/lib/types.ts`)

**Database/Domain field naming:**
- snake_case is used for fields that mirror the database / Supabase columns (`slash_group_id`, `last4`, `exp_month`, `exp_year`, `created_by_email`, `excluded_until`, `usage_count`, `created_at`)
- camelCase fields are used for selector arrays / in-memory shapes (`cardNumberSelectors`, `address1Selectors`)
- This mixing is intentional and load-bearing — keep the snake_case form whenever the value originates in or maps directly to a DB column.

## Code Style

**Formatting:**
- No formatter configured (no `.prettierrc*`, `biome.json`, or formatter script in `package.json`)
- Observed style: 2-space indentation, semicolons required, double quotes in newer files (`src/popup/App.tsx`, `src/components/AdminOptions.tsx`) and single quotes in older files (`src/lib/auth.ts`, `src/lib/supabase.ts`, `src/components/Login.tsx`). Match the surrounding file when editing.
- Trailing commas used in multi-line object/array literals
- JSX uses double-quoted attributes

**Linting:**
- No ESLint or Biome config detected. TypeScript strictness is the only gate.

**TypeScript strictness (`tsconfig.json`):**
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `jsx: "react-jsx"` (no need to import React for JSX)
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `isolatedModules: true`, `noEmit: true`
- `types: ["chrome"]` — `chrome.*` APIs are globally typed
- Target `ES2020`, libs `ES2020`, `DOM`, `DOM.Iterable`
- Server code uses a relaxed config (`tsconfig.server.json`): `module: "commonjs"`, `noImplicitAny: false`, `esModuleInterop: true` — `any`-typed values are tolerated server-side

## Import Organization

**Order (observed):**
1. External packages (`react`, `lucide-react`, `@supabase/supabase-js`, `express`, `cors`)
2. Internal modules via relative paths (`../lib/types`, `./supabase`, `../components/...`)
3. Styles last (`import '../styles/globals.css'` in `src/popup/index.tsx`)

**Path Aliases:**
- None configured. All imports are relative (`../lib/types`, `./auth`).

**Re-exports / barrel files:**
- Not used. Each module is imported directly.

## Error Handling

**Async/await with try-catch returning result objects:**
- Auth functions return `{ user, error }` discriminated objects rather than throwing (`signIn`, `signUp`, `signOut` in `src/lib/auth.ts`)
- Catch blocks type the error as `any` and read `error.message` (`catch (error: any)`)
- Internally, helpers may throw (`createSlashGroup` throws on non-OK response in `src/lib/auth.ts:36`); the outer wrapper catches.

**Chrome runtime messaging:**
- Every `chrome.runtime.sendMessage` call wraps a `setTimeout(..., 5000)` watchdog that flips loading state off if the background script never responds (see `fetchCards`, `handleGenerateCard`, `handleAutofillNext`, `handleAutofillCard` in `src/popup/App.tsx`)
- Always check `chrome.runtime.lastError` inside the response callback before reading the response
- Always `clearTimeout(timeout)` first thing in the response callback
- Response shape: `{ cards | card | success | addresses | error }` — check the success field, then fall back to `response.error`
- New message handlers should follow the same `clearTimeout → lastError check → success branch → error branch` pattern.

**Fetch errors:**
- HTTP calls check `response.ok`, then `await response.text().catch(() => '')` to safely extract a body, then throw with status + body (e.g., `createSlashGroup` in `src/lib/auth.ts:36-41`)

## Logging

**Framework:** `console.*` only. No structured logger.

**Patterns:**
- Heavy use of bracketed prefix tags identifying the call site: `console.log('[App] ...')`, `console.log('[useAuth] ...')`, `console.log('[getCurrentUser] ...')`, `console.log('[signIn] ...')`, `console.warn('[signUp] ...')`, `console.error('[fetchCards] TIMEOUT ...')`
- `console.log` for normal flow, `console.warn` for recoverable issues, `console.error` for failures
- The codebase logs verbosely in production code paths (no log-level gating). When adding new code, follow the `[Scope] message` convention so logs remain greppable.
- Server uses `console.warn` / `console.error` with the same `[functionName]` prefix (`server/index.ts:67`)

## Comments

**When to Comment:**
- JSDoc-style block comments above exported auth functions (`/** Sign in with email and password */` in `src/lib/auth.ts`)
- Inline `//` comments to explain *why* a workaround exists (e.g., `// Disable automatic session persistence - we'll handle it manually` in `src/lib/supabase.ts`; `// Add timeout in case background script doesn't respond` in `src/popup/App.tsx`)
- JSX section dividers: `{/* Header */}`, `{/* Main Content */}`, `{/* Search & Actions */}`, `{/* Card List */}` in `src/popup/App.tsx`

**JSDoc/TSDoc:**
- Lightweight, single-line `/** ... */` summaries on exported helpers; no `@param` / `@returns` tags

## Function Design

**Size:**
- Components are large and monolithic. `src/popup/App.tsx` is ~500 lines and `src/components/AdminOptions.tsx` is the largest component file. There is no enforced max — if your function naturally fits a similar workflow, in-line it; do not over-extract.

**Parameters:**
- React components take a single `Props` object destructured at the parameter list (`function Login({ onSwitchToSignup }: LoginProps)`)
- Helper functions take positional arguments (`mapSlashCardToAppCard(slashCard)`, `setAutofillLoading(tabId, isLoading)`)

**Return Values:**
- Async auth/API helpers return `{ data, error }`-style objects so callers can branch without try-catch
- Format helpers (`formatExpiry`, `formatDateSafe` in `src/popup/App.tsx`) return safe fallbacks (`"—"`, `"Unknown"`) instead of throwing

## Module Design

**Exports:**
- Named exports preferred for utilities, hooks, and components (`export function Login`, `export function useAuth`, `export const supabase`)
- One default export reserved for the popup root component (`export default App` in `src/popup/App.tsx`)
- `src/lib/constants.ts` exports each constant individually as a named export

**Barrel Files:** None. Import each symbol from its source module.

## React Patterns

**Hooks usage:**
- Functional components only — no class components
- `useState` for all UI state with explicit type parameters when not inferable (`useState<AuthView>("login")`, `useState<Card[]>([])`, `useState<Record<string, ...>>({})`)
- `useEffect` cleanup with a `let mounted = true` guard before async setState (`src/lib/useAuth.ts:12-42`) to prevent setState-after-unmount
- `useRef<number | null>(null)` for mutable timer handles in admin UI (`saveTimeoutRef` in `src/components/AdminOptions.tsx`)
- `React.StrictMode` wraps the popup root (`src/popup/index.tsx:14`)
- Custom hook lives in `src/lib/useAuth.ts`, separate from the React tree, returning `{ user, isLoading }`

**Side-effect data fetching:**
- Fetching happens inside component handlers, then lifts result into `useState`. There is no React Query, SWR, or context store.
- Auth state is fanned out via a manual listener array (`authListeners` in `src/lib/auth.ts:22`) plus the `useAuth` hook — when adding new global state, follow this listener pattern rather than introducing a context.

**Conditional rendering:**
- Early returns from the component for top-level states: `if (!isSupabaseConfigured()) return <ConfigError />;`, `if (authLoading) return <Loading />;`, `if (!user) return <Login .../>;` (`src/popup/App.tsx:305-327`)
- Inline `&&` and ternaries inside JSX for finer-grained conditions

**Component composition:**
- Page-level components (`Login`, `Signup`, `AdminOptions`) live in `src/components/` and are imported directly into `App.tsx`
- Components communicate upward via callback props (`onSwitchToSignup`, `onSwitchToLogin`)
- No prop-drilling beyond one level — auth state is read from `useAuth()` wherever needed

## Tailwind CSS Usage

**Setup:**
- Tailwind v3.4 (`tailwind.config.js`) with default theme (`extend: {}`), no custom plugins
- Content glob: `./src/**/*.{js,jsx,ts,tsx,html}`
- Utilities are layered via `@tailwind base; @tailwind components; @tailwind utilities;` in `src/styles/globals.css`
- Popup is fixed-size: `body { width: 400px; height: 600px; overflow: hidden; }` plus `#root { width: 100%; height: 100%; }` — designs MUST fit this 400×600 viewport.

**Class ordering / patterns:**
- Inline className strings — no `clsx` / `tailwind-merge` use observed in popup code despite both being in `dependencies`. If you start composing conditional class names, prefer `clsx` (and `twMerge` from `tailwind-merge` for de-duping) over string interpolation.
- Color palette is consistently `indigo-600` / `indigo-700` for primary actions, `gray-50` / `gray-100` / `gray-600` / `gray-900` for chrome, `red-50` / `red-200` / `red-600` / `red-800` for errors, `amber-50` / `amber-600` for warnings (cooldown badges)
- Buttons follow a recurring pattern: `bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-70` (see `src/components/Login.tsx:99`, `src/popup/App.tsx:386`)
- Disabled state: always pair `disabled` attribute with `disabled:opacity-50` / `disabled:opacity-70` and `disabled:cursor-not-allowed`
- Spinners: `lucide-react`'s `RefreshCw` or `Loader2` with `animate-spin`
- Layout: flex / grid with `gap-*`; cards use `bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow`
- Focus rings: `focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none` on inputs

**Icons:**
- All icons come from `lucide-react`. Standard sizes: `w-4 h-4` inside buttons, `w-5 h-5` for header chrome, `w-6 h-6` for hero / logo, `w-8 h-8` for full-screen loaders.

## Component Organization

**Where things live:**
- Reusable UI components: `src/components/<PascalCase>.tsx` — one component per file, named export
- Popup root: `src/popup/App.tsx` (default export) and `src/popup/index.tsx` (mounts React)
- Hooks and pure logic: `src/lib/`
- Shared types: `src/lib/types.ts` (single file, all interfaces)
- Constants/config: `src/lib/constants.ts`
- Background service worker: `src/background/index.ts`
- Content scripts: `src/content/index.ts` and `src/content/networkWatcherInjected.ts`
- Server: `server/` (Express, `tsconfig.server.json`)

**Adding a new component:**
1. Create `src/components/<Name>.tsx` with a named export and a `<Name>Props` interface
2. Use double quotes and 2-space indent (match `AdminOptions.tsx` / `App.tsx` for new code)
3. Keep all state with `useState`; lift only what `App.tsx` needs into props
4. Use Tailwind utilities only — do not add new CSS files; if a global rule is unavoidable, extend `src/styles/globals.css` sparingly

---

*Convention analysis: 2026-05-03*
