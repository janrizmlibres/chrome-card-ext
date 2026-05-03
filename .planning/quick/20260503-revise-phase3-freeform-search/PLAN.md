---
gsd_quick_version: 1.0
slug: revise-phase3-freeform-search
created: 2026-05-03
type: docs-revision
---

# Quick Task: Revise Phase 3 — Freeform Search

## Description

Replace the cascading state→city dropdown design in Phase 3 (Address Filtering) with a single freeform search input. The search string matches case-insensitively against either `city` OR `state`; one substring match in either column is sufficient to include the address in the active pool.

## Rationale

Client feedback: a single search field is faster to use than two cascading dropdowns and lets users filter on partial values (e.g. "tex" matches both Texas state addresses and a "Texarkana" city). Cascading dropdowns force a state pick before any city narrowing — extra clicks, no partial matches.

## Files to Update

1. `.planning/ROADMAP.md` — Phase 3 section: goal, success criteria (1–3), plan items 03-01 / 03-02
2. `.planning/REQUIREMENTS.md` — FILTER-01..04 to describe freeform single-field search semantics
3. `.planning/STATE.md` — append decision + Quick Tasks Completed entry

## Out of Scope

- No code changes (Phase 3 has not been executed yet)
- No new requirement IDs — reuse FILTER-01..04 to preserve traceability
- Card-row display behavior (FILTER-04 / success criterion 4) is unchanged
