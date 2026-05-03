# Phase 1: Import Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 1-Import Sync
**Areas discussed:** Async import timing, Card import scope, Refresh signaling pattern, Post-import UX, Failure handling

---

## Async import timing

**Question asked:** The server returns HTTP 202 before Supabase has the rows (server/index.ts:990-1009 uses fire-and-forget IIFE). How should the popup get accurate post-import data?

| Option | Description | Selected |
|--------|-------------|----------|
| Change server: await inline, return 200 | Drop the background IIFE; await chunk inserts before responding. Popup refetches once on resolve. Deterministic, no polling. | ✓ |
| Keep server async; popup polls | fetchAddresses every ~500ms up to ~5s, stop when count increases or timeout | |
| Keep server async; fixed delay | Wait ~1.5s on the client then refetch once | |
| Refetch immediately on 202 | Accept that first refresh may show old data; rely on user retry | |

**User's choice:** Server-side change (option 1), driven by a UX question — "Is there a way we can make the 'Import Addresses' button be in a loading state as indication while importing is in progress? Is this possible without blocking the UI?"
**Notes:** This UX framing made the choice obvious: a synchronous server makes the button-loading-state truthful and removes all polling/delay complexity. React rendering remains non-blocking; only the Import button is disabled while the request is in flight.

---

## Card import scope

**Question asked:** No admin card-import flow exists in the code today. How do we treat ROADMAP success-criterion #2 ("after a card import completes, the popup's card list updates")?

| Option | Description | Selected |
|--------|-------------|----------|
| Mark as N/A for this phase | handleGenerateCard already self-refreshes; no other entry point. Update PROJECT/ROADMAP at next transition. | ✓ |
| Wire inert callback prop now | onCardsImported wired but unused, ready for a future card-import flow | |
| Verify existing self-refresh covers the criterion | Tick the box, no code changes | |

**User's choice:** Out of scope — option 1.
**Notes:** User stated plainly: "We don't import cards. This is out of scope and will not be considered." Captured as a deferred PROJECT/ROADMAP cleanup at the next phase transition (CONTEXT D-16).

---

## Refresh signaling pattern

**Question asked:** How should AdminOptions tell App to re-fetch?

| Option | Description | Selected |
|--------|-------------|----------|
| Callback prop from App | App passes onAddressesImported (= fetchAddresses) into AdminOptions. Idiomatic React. | ✓ |
| Lift import handler into App | AdminOptions becomes presentational | |
| window CustomEvent | AdminOptions dispatches; App useEffect listens | |
| chrome.runtime broadcast | AdminOptions → background → App via onMessage | |

**User's choice:** Initially deferred ("Defer until 1st question answered. Drop if it becomes irrelevant later"). Once the server became synchronous, the simplest pattern was confirmed: callback prop.
**Notes:** With the synchronous server response, there's no out-of-band coordination needed — a plain callback prop is sufficient. Window events and chrome.runtime broadcasts would have only been justified if the import were truly fire-and-forget.

---

## Post-import UX

**Question asked:** What does the user see while the auto-refetch runs?

| Option | Description | Selected |
|--------|-------------|----------|
| Loading button state | Import button disabled with spinner during the entire import + refetch flow; existing importStatus text covers progress | ✓ |
| Inline status only | Reuse existing importStatus text; no button change | |
| Auto-switch to vault tab | Move user back to vault and show spinner in card list | |
| Toast/banner overlay | Transient "Vault updated" toast | |
| Silent | No new indicator | |

**User's choice:** "Loading button state" — confirmed via the timing question's UX framing.
**Notes:** Mirror the existing pattern in `App.tsx:386-393` (handleGenerateCard). RefreshCw spinner inside the button, `disabled={isImporting}`. Status text in importStatus carries the verbal progress.

---

## Failure handling

**Question asked:** If the post-import auto-refetch fails (timeout, runtime error, etc.), what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error, no retry | importStatus shows "Imported N addresses, but vault refresh failed — reopen the popup". Existing 5s watchdog in fetchAddresses prevents hang. | ✓ |
| Single auto-retry | Try once more after ~1s, then show inline error | |
| Silent fail | No indicator; rely on next user interaction | |

**User's choice:** Initially deferred ("Defer until 1st question clarification. Drop if not relevant later"). Once timing was settled, accepted the inline-error-no-retry default.
**Notes:** Recovery path is "close + reopen popup" which re-runs `useEffect([user])` → `fetchAddresses()`. Cheap, deterministic, doesn't hide failures.

---

## Claude's Discretion

- Exact wording of the three importStatus phases (importing → refreshing → done)
- Whether `isImporting` is a single boolean or a small state machine (`importPhase: 'idle' | 'importing' | 'refreshing' | 'done' | 'error'`)
- Whether the post-import fetchAddresses failure path uses the existing `importStatus` string or a separate `refreshError` state

## Deferred Ideas

- Card import sync — wait until a card-import flow actually exists; then wire `onCardsImported` analogously
- Optimistic UI for imported addresses — unnecessary now that the server response is authoritative and fast
- Retry/backoff on failed post-import refresh — explicitly rejected; revisit only with telemetry evidence
- Per-card sticky address assignment — unchanged v2 item from PROJECT.md
- PROJECT.md / ROADMAP.md cleanup — narrow SYNC-01 wording and Phase 1 success criterion #2 to address-only at the next phase transition
