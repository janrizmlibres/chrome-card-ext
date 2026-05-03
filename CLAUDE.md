# CLAUDE.md — Slash Vault Chrome Extension

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Slash Vault** is a Chrome Manifest V3 extension that autofills Slash virtual card details and addresses into web forms. Cards are sourced from the Slash API; addresses are stored in Supabase. Autofill is triggered per-card from the popup or globally via Ctrl+Shift+F.

**Current milestone:** Three client-reported UX and data fixes:
1. **Import Sync (Phase 1)** — Popup should auto-refresh after admin imports without user interaction
2. **Address Filtering (Phase 2)** — State/city filter in popup controls which addresses pair with cards
3. **Address Display Debug (Phase 3)** — "No address available" appears on all cards despite Supabase being populated

**Planning artifacts:** `.planning/` — read `STATE.md` first, then `ROADMAP.md` for current phase context.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3 (popup + service worker + content script) |
| UI | React 19 + TypeScript 5.9, Tailwind CSS v3.4 |
| Icons | lucide-react |
| Backend | Express 5 + ts-node (localhost:3000) |
| Database | Supabase (PostgreSQL + Auth) — service role on backend, anon key in extension |
| Card API | Slash API (api.joinslash.com / vault.joinslash.com) |
| Build | Vite 7 (3 entries: popup, background, content → dist/) |
| Dev | nodemon + ts-node for the Express server |

**Popup viewport is fixed:** 400×600px. All UI must fit this constraint.

**Run commands:**
- `npm run build` — Vite build → `dist/` (load unpacked in Chrome)
- `npm run dev` — Vite watch mode
- `npm run server` — Express backend (nodemon)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### File & Naming
- React components: `PascalCase.tsx` in `src/components/`; one component per file, named export
- TS modules: `camelCase.ts` in `src/lib/` or `server/`
- Chrome message types: `SCREAMING_SNAKE_CASE` strings (e.g., `GET_CARDS`, `GET_ADDRESSES`)
- Handler functions: prefix `handle*` (e.g., `handleAutofillCard`, `handleGenerateCard`)
- Boolean state: prefix `is*` or `has*` (`isLoading`, `hasAutofillCandidates`)

### TypeScript
- `strict: true` — no implicit any, unused locals/params are errors
- Server config (`tsconfig.server.json`) is relaxed: `noImplicitAny: false`
- DB-origin fields stay snake_case (`slash_group_id`, `usage_count`, `excluded_until`); in-memory shapes use camelCase (`cardNumberSelectors`)

### Chrome Messaging (critical pattern)
Every `chrome.runtime.sendMessage` call in the popup **must**:
```typescript
const timeout = setTimeout(() => { setLoading(false); }, 5000); // watchdog
chrome.runtime.sendMessage({ type: 'MY_TYPE', payload }, (response) => {
  clearTimeout(timeout);                           // always first
  if (chrome.runtime.lastError) { ... return; }   // always second
  if (response?.success) { ... }                  // happy path
  else if (response?.error) { ... }               // error path
});
```

### Adding a new popup feature
1. New message type → add `if (message.type === 'NEW_TYPE') { ...; return true; }` in `src/background/index.ts`
2. New Express route → `app.get/post('/api/...', async (req, res) => {...})` in `server/index.ts`
3. New types → `src/lib/types.ts` (shared by both extension and backend)
4. Never `fetch()` directly from the popup — route through background via `chrome.runtime.sendMessage`

### Logging
Use `[Scope] message` prefix: `console.log('[fetchAddresses] ...')`, `console.error('[handleAutofillCard] ...')`. No structured logger.

### Tailwind palette
- Primary: `indigo-600` / `indigo-700`
- Background chrome: `gray-50` / `gray-100` / `gray-600`
- Warning: `amber-50` / `amber-600`
- Error: `red-50` / `red-600`
- Cards: `bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow`
- Primary buttons: `bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-70`
- Inputs: `focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

```
Chrome Extension (MV3)
├── Popup (React 19) — src/popup/App.tsx
│   └── sends messages to Background via chrome.runtime.sendMessage
├── Background SW — src/background/index.ts
│   └── fetches http://localhost:3000 (Express)
│   └── sends messages to Content via chrome.tabs.sendMessage
└── Content Script — src/content/index.ts
    └── DOM read/write, in-page modals, autofill execution
        └── networkWatcherInjected.ts (MAIN world — patches fetch/XHR)

Express Backend — server/index.ts (port 3000)
├── Supabase (service role) — users, addresses, selector_profiles, settings, audit_logs
└── Slash API — source of truth for Card records (api.joinslash.com)
```

### Card-Address Pairing — KEY LEARNING

**Cards and addresses have no database relationship.** There is no foreign key, no join table, no per-card address assignment.

Pairing is **pure round-robin by card list index** in `App.tsx`:

```typescript
const pairedAddress =
  activeAddresses.length > 0
    ? activeAddresses[idx % activeAddresses.length]
    : null;
```

- Card at index 0 gets `addresses[0]`, card at index 1 gets `addresses[1]`, card at index 2 gets `addresses[0]` again, etc.
- **Filtering is the selection mechanism.** The client controls which address pairs with which card by filtering the address pool by state/city. Filtered pool → new round-robin assignments.
- There is no dropdown per card, no sticky per-card memory, and no autofill-time address picker. Do not add these unless explicitly requested.

### Address data flow

```
popup fetchAddresses()
  → chrome.runtime.sendMessage({ type: 'GET_ADDRESSES', payload: { activeOnly: true } })
  → background handler
  → fetch('http://localhost:3000/api/addresses?userId=...')
  → Express: SELECT from addresses WHERE user_id = ? AND active = true
  → Supabase → response flows back
```

**Active addresses** = `addresses.filter(a => !a.excluded_until || new Date(a.excluded_until) <= new Date())`

### Popup refresh lifecycle

`fetchCards()` and `fetchAddresses()` are called only inside `useEffect([user])` — i.e., on login. They are **not** called after admin import. This is the root cause of the sync issue (Phase 1).

### MV3 constraints
- Background service worker is not persistent — can be torn down at any time
- All in-memory state in background can disappear; re-derive from `chrome.storage.local` or the API on each message
- `chrome.storage.local` keys: `supabase_session`, `currentUser`

### Known issues under investigation
- **"No address available" (Phase 3):** Addresses are confirmed in Supabase `addresses` table but do not appear in the popup. Root cause unknown — likely in the `GET_ADDRESSES` → background → Express → Supabase data path. Suspect: missing or wrong `userId` filter, Supabase RLS, or Express query condition. Do not assume this is a sync issue — it is isolated.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project-local skills defined yet.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing (use for Phase 3 address debugging)
- `/gsd-plan-phase N` or `/gsd-discuss-phase N` to plan the next phase
- `/gsd-execute-phase N` for planned phase work

Current phase: **Phase 1 — Import Sync** (ready to plan)
Next: `/gsd-discuss-phase 1` or `/gsd-plan-phase 1`

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` — do not edit manually.
<!-- GSD:profile-end -->
