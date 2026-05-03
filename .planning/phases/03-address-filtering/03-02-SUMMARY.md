---
phase: 03-address-filtering
plan: 02
status: complete
completed: 2026-05-03
files_modified:
  - src/popup/App.tsx
key-files:
  modified:
    - src/popup/App.tsx
---

# Plan 03-02 Summary — Filter Wiring + Empty-State

## What was built

Wired the `addressSearch` state from Plan 03-01 into the address-pairing pipeline. Filter narrows the round-robin pool live; clearing restores it. Distinct empty-state copy now distinguishes "filter has zero matches" from "no addresses imported".

### 1. `filteredAddresses` derivation

Added directly after `activeAddresses` (`src/popup/App.tsx`, around line 155):

```tsx
const filteredAddresses = activeAddresses.filter((address) => {
  const query = addressSearch.trim().toLowerCase();
  if (!query) return true;
  return (
    address.city.toLowerCase().includes(query) ||
    address.state.toLowerCase().includes(query)
  );
});
```

- Mirrors `filteredCards` shape (D-04).
- Single literal substring — no whitespace tokenization (D-05).
- Match scope strictly `city` + `state`; not `name`/`street`/`zip` (D-06).
- Layered on top of `activeAddresses`, so excluded addresses can never appear (D-09).
- No `useMemo` (D-08).

### 2. Round-robin switch site

`pairedAddress` computation in the per-card render block now reads from `filteredAddresses`:

```tsx
const pairedAddress =
  filteredAddresses.length > 0
    ? filteredAddresses[idx % filteredAddresses.length]
    : null;
```

Old `activeAddresses[idx % activeAddresses.length]` is fully removed.

### 3. Three-branch empty-state ternary

The paired-address render block now distinguishes three cases (in order):

```tsx
{pairedAddress ? (
  <div className="text-gray-600">Address: …</div>
) : activeAddresses.length > 0 ? (
  <div className="text-gray-400">No address matches filter</div>
) : (
  <div className="text-gray-400">No address available</div>
)}
```

- Order in source: "No address matches filter" appears before "No address available".
- Branch keyed off `activeAddresses.length` (NOT `filteredAddresses.length`) so it correctly distinguishes "filter mismatch" from "pool empty".
- No clear-filter button, no warning banner, no auto-fallback (D-12).

### 4. `hasAutofillCandidates` deliberately unchanged

```tsx
const hasAutofillCandidates = activeCards.length > 0 || activeAddresses.length > 0;
```

Rationale: the global "Autofill Next" button reflects whether the user has ANY usable addresses, not whether the current filter matches any. Keying it off `filteredAddresses` would disable the button mid-typing — worse UX. Captured in plan 03-02 task 1, step 3.

## Verification

- `npm run build` exits 0
- `grep -c "filteredAddresses" src/popup/App.tsx` → 4 (declaration + length check + index access + length-zero comparison)
- `grep -c "activeAddresses\\[idx % activeAddresses\\.length\\]"` → 0 (old round-robin gone)
- `grep -c "No address matches filter"` → 1
- `grep -c "No address available"` → 1
- `grep -c "useMemo"` → 0 (D-08 honored)
- `grep -c "address.name.toLowerCase|address.street|address.zip"` → 0 (D-06 honored)
- `hasAutofillCandidates = activeCards.length > 0 || activeAddresses.length > 0` line still present (per design)

## Deviations

None.

## Closes

- FILTER-02 (case-insensitive substring against city OR state)
- FILTER-03 (clearing restores full pool)
- FILTER-04 (each card displays the name, city, state of its currently paired filtered address)
- D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-14
