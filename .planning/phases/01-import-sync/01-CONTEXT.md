# Phase 1: Import Sync - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

When an admin completes an address import in `AdminOptions`, the popup's address list (held in `App.tsx`) re-fetches automatically and card pairings update — no popup close/reopen, no tab switch, no manual refresh click required. The Import button itself reflects the in-flight state of the import so the user knows when it is safe to expect updated data.

**Card import is out of scope for this phase** — there is no admin card-import flow today. Single-card creation via `handleGenerateCard` already calls `fetchCards()` itself and is unaffected.

</domain>

<decisions>
## Implementation Decisions

### Server timing — make import synchronous
- **D-01:** Change `POST /api/addresses/import` (`server/index.ts:943`) from fire-and-forget to inline `await` of all chunk inserts. Return `200` after the final chunk completes, with the actual inserted/upserted count. Drop the current 202 + background IIFE pattern.
- **D-02:** Response shape stays compatible: `{ accepted: number, message: string }` — `accepted` becomes the post-insert count rather than the pre-insert sanitized count. Add an `inserted` count if useful; do not break existing fields.
- **D-03:** Per-chunk errors continue to log to `console.error` and continue with remaining chunks (existing behavior preserved). The handler returns success as long as the request itself didn't throw; partial failures surface in the count delta and server logs.

### Refresh signaling — callback prop
- **D-04:** `App.tsx` passes a new `onAddressesImported` callback prop into `<AdminOptions />`. The callback is `fetchAddresses` (the existing function defined in `App.tsx`).
- **D-05:** `AdminOptions` calls `onAddressesImported()` from inside `handleImportParsed` immediately after a successful (HTTP 2xx) import response, before resetting `isImporting`.
- **D-06:** No window events, no chrome.runtime broadcasts, no global store. Plain React props only.

### Import button UX — local in-flight state
- **D-07:** `AdminOptions` adds a local `isImporting: boolean` state. Set `true` at the start of `handleImportParsed`, cleared in a `finally` block.
- **D-08:** Import button is `disabled={isImporting}` and renders `<RefreshCw className="w-4 h-4 animate-spin" />` while importing, mirroring the existing pattern at `App.tsx:386–393` (`handleGenerateCard`).
- **D-09:** UI is not blocked — only the Import button is disabled. The user can switch tabs, scroll, edit selectors, etc. while the import is in flight.
- **D-10:** Existing `importStatus` text remains the primary status surface. Suggested copy progression: `"Importing from <label>..."` → `"Imported N addresses — refreshing vault..."` (during the post-import `fetchAddresses` call) → `"Imported N addresses. Vault updated."`.

### Failure handling — inline, no retry
- **D-11:** If the import POST itself fails (network error, non-2xx, etc.), keep the existing inline error message in `importStatus`. No callback invoked. `isImporting` cleared.
- **D-12:** If the import POST succeeds but `fetchAddresses()` fails, surface an inline error such as `"Imported N addresses, but vault refresh failed — close and reopen the popup."` The existing 5-second watchdog inside `fetchAddresses` already prevents indefinite hangs.
- **D-13:** No automatic retry. Reopening the popup re-runs `useEffect([user])` which calls `fetchAddresses()` again — that is the documented recovery path.

### Card import — out of scope
- **D-14:** Phase 1 implements **only** the address-import sync path. The roadmap's success-criterion #2 ("after a card import completes...") is explicitly N/A for this phase: no admin card-import flow exists in the codebase, and `handleGenerateCard` already self-refreshes via its own `fetchCards()` call (`App.tsx:225`).
- **D-15:** No `onCardsImported` callback prop is wired pre-emptively. If a card-import flow is built later, that future phase adds the prop.
- **D-16:** Deferred follow-up: at the next phase transition, update PROJECT.md SYNC-01 wording and ROADMAP.md Phase 1 success criterion #2 to reflect the address-only scope, so traceability stays accurate.

### Claude's Discretion
- Exact wording of the three importStatus phases (D-10) — Claude may tune wording during planning.
- Whether to extract `isImporting` into a single `importPhase: 'idle' | 'importing' | 'refreshing' | 'done' | 'error'` state machine vs. one boolean — Claude picks based on readability during implementation.
- Whether the post-import `fetchAddresses()` failure path uses the existing `importStatus` string or a separate `refreshError` state — Claude picks based on readability.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — SYNC-01 requirement, address-card pairing model, MV3 constraints
- `.planning/REQUIREMENTS.md` §v1 Sync — SYNC-01 acceptance language
- `.planning/ROADMAP.md` §"Phase 1: Import Sync" — goal, success criteria, dependency chain
- `CLAUDE.md` §"Popup refresh lifecycle" — explicit note that `fetchCards()` / `fetchAddresses()` only fire on login today; § "Chrome Messaging (critical pattern)" — watchdog/timeout pattern that `fetchAddresses` already follows

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` §"Backend (Express + ts-node)" — addresses bulk import endpoint summary
- `.planning/codebase/STRUCTURE.md` §`server/index.ts` — confirms address bulk import lives there
- `.planning/codebase/CONVENTIONS.md` — naming, message-type, and async patterns to follow

### Touchpoints (to be modified)
- `server/index.ts:943-1010` — `POST /api/addresses/import` route; convert from 202 + background IIFE to inline awaited insert returning 200
- `src/components/AdminOptions.tsx:51–54, 358–407, 409–425, 822` — `importText`/`importStatus`/`importCount` state, `handleImport`, `handleImportParsed`, file-pick handler, Import button render
- `src/popup/App.tsx:74–106, 108–115, 496` — `fetchAddresses`, `useEffect([user])`, `<AdminOptions user={user as User} />` site

### Patterns to mirror (do NOT modify)
- `src/popup/App.tsx:202–230` — `handleGenerateCard` is the canonical example of the loading-button + spinner + post-action refetch pattern. The new `isImporting` state in `AdminOptions` should mirror its shape.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchAddresses()` in `App.tsx:74–106` — already implements the watchdog/timeout pattern, handles `chrome.runtime.lastError`, and falls back to `[]` on bad responses. Pass it as `onAddressesImported` prop unchanged.
- `RefreshCw` icon from `lucide-react` (already imported in both `App.tsx` and `AdminOptions.tsx`) — used for the spinner-in-button pattern.
- `importStatus` / `setImportStatus` in `AdminOptions` — repurpose for the three-stage status text rather than introducing a new field.

### Established Patterns
- **Loading-button-with-spinner**: see `App.tsx:386–393`. New Import button follows the same `disabled={isImporting}` + conditional `<RefreshCw className="animate-spin" />` shape.
- **Callback-prop wiring** between `App` and child components: `AdminOptions` is currently a leaf that only receives `user`. Adding `onAddressesImported` is consistent with React conventions and adds zero new infra.
- **`chrome.runtime.sendMessage` watchdog**: every existing fetch in `App.tsx` uses a 5s setTimeout watchdog. `fetchAddresses` already does this — no change needed.
- **Server route style**: existing routes in `server/index.ts` use `async (req, res)` with explicit `res.status(...).json(...)` and `try/catch`. The converted import handler follows this style.

### Integration Points
- **App ↔ AdminOptions**: new optional prop `onAddressesImported?: () => void` on `AdminOptionsProps` (line 41–43). App passes `fetchAddresses`. AdminOptions invokes it after a successful import.
- **AdminOptions ↔ Express**: existing `fetch("http://localhost:3000/api/addresses/import", ...)` call site is the only client of this endpoint. Changing the server response from 202 to 200 is safe — the client only checks `res.ok` (`AdminOptions.tsx:393–401`).
- **Express ↔ Supabase**: chunked upserts already exist in the IIFE. Inline conversion is mechanical: drop the IIFE wrapper, await chunk loop before `res.status(...).json(...)`.

</code_context>

<specifics>
## Specific Ideas

- User explicitly asked: "Is there a way we can make the 'Import Addresses' button be in a loading state as indication while importing is in progress? Is this possible without blocking the UI?" — answered yes; this drove D-07 through D-10. The button-spinner pattern from `handleGenerateCard` is the user-visible reference.
- User confirmed callback wiring (D-04 to D-06) only after timing was resolved — they preferred to defer wiring choice until they saw whether the server change would change the requirements. With the server now synchronous, callback props are sufficient.

</specifics>

<deferred>
## Deferred Ideas

- **Card import sync** — no admin card-import flow exists today. If/when one is built, that future phase wires `onCardsImported` analogously to `onAddressesImported`. Capture in PROJECT.md / ROADMAP.md at the next transition.
- **Optimistic UI for imported addresses** — could insert parsed rows into the popup's address list immediately on import success without waiting for the round-trip refetch. Not needed now since the synchronous server change makes the refetch fast and authoritative. Out of scope.
- **Retry/backoff for failed post-import refresh** — explicitly rejected (D-13) in favor of the reopen-popup recovery path. Revisit only if telemetry shows real users hitting this.
- **Per-card sticky address assignment** (PROJECT.md ADR-01 / v2) — unchanged; still v2 territory.

</deferred>

---

*Phase: 1-Import Sync*
*Context gathered: 2026-05-03*
