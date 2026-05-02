# Testing Patterns

**Analysis Date:** 2026-05-03

## Test Framework

**None installed.**

> **Important:** The `test` script in `package.json` is a placeholder, not a real test runner:
>
> ```json
> "test": "echo \"Error: no test specified\" && exit 1"
> ```
>
> Running `npm test` will exit non-zero with `Error: no test specified`. There is no Jest, Vitest, Mocha, Playwright, Cypress, or any other test framework configured in `dependencies` or `devDependencies` (`package.json`). There is no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `__tests__/` directory anywhere in the repo.

**Runner:** Not configured.
**Assertion Library:** Not configured.
**Config files:** None.

**Run Commands:**
```bash
# Working scripts (package.json):
npm run build       # vite build
npm run dev         # vite build --watch
npm run server      # nodemon ts-node server/index.ts
npm run seed        # ts-node server/seed.ts
npm test            # PLACEHOLDER — exits with "Error: no test specified" (exit 1)
```

## Test File Organization

**Location:** Not applicable — no test files exist.

A repo-wide search returns zero matches:
```bash
find . -type f \( -name "*.test.*" -o -name "*.spec.*" \) -not -path "*/node_modules/*"
# (no results)
```

**Naming:** No convention has been established.

**Suggested location if/when tests are added:**
- Co-locate with source: `src/lib/auth.test.ts` next to `src/lib/auth.ts`
- Server tests: `server/index.test.ts` (would need a separate test config that uses `tsconfig.server.json` semantics)

## Test Structure

Not applicable — no test patterns exist in this codebase.

## Mocking

Not applicable. The codebase does have heavy external dependencies that would need mocking when tests are introduced:

- **Chrome extension APIs** (`chrome.runtime.*`, `chrome.storage.local.*`, `chrome.tabs.*`, `chrome.contextMenus.*`) used throughout `src/popup/App.tsx`, `src/background/index.ts`, `src/content/index.ts`, `src/lib/auth.ts`. These are global and only available inside an extension context — any unit test runner will need a stub (e.g., `sinon-chrome` or hand-rolled mocks).
- **Supabase client** (`@supabase/supabase-js`) instantiated in `src/lib/supabase.ts` and `server/supabase.ts`. Tests should mock the client returned by `createClient`, not hit a real project.
- **Slash external API** (`https://api.joinslash.com`, `https://vault.joinslash.com`) called via `fetch` from `server/index.ts` and `src/lib/auth.ts`. Mock `fetch` (e.g., `nock`, `msw`, or `vi.fn()`).
- **Express server** (`server/index.ts`) — for route tests, use `supertest` against the exported app (note: `server/index.ts` currently calls `app.listen` directly inside the same module; route-testability would require splitting the listener from the app definition).

## Fixtures and Factories

Not applicable. No fixtures directory exists. Seed data lives in `server/seed.ts` (run via `npm run seed`) and is intended for development databases, not tests.

## Coverage

**Requirements:** None. No coverage tool, no threshold, no CI gate.

**View Coverage:** Not applicable.

## Test Types

**Unit Tests:** None.
**Integration Tests:** None.
**E2E Tests:** None. (The Chrome extension itself is exercised manually via "Load unpacked" — see steps 1–5 of "Quick Start" in `README.md`.)

## CI

**No CI configured.** There is no `.github/` directory, no `.gitlab-ci.yml`, no `.circleci/`, no `azure-pipelines.yml`, and no other pipeline config in the repo. Pre-commit hooks are not installed (no `.husky/`, no `lint-staged` in `package.json`).

This means:
- Nothing automatically blocks a broken build, type error, or regression on push.
- The TypeScript compiler is the only static gate, and it only runs when a developer manually invokes `npm run build` (which calls `vite build`, which type-checks via Vite's plugin pipeline) or `npm run server` (which type-checks via `ts-node`).

## Common Patterns

**Async Testing:** Not applicable.

**Error Testing:** Not applicable.

## Recommendations for Adding a Test Suite

When tests are introduced, the following choices fit the existing stack:

1. **Runner:** Vitest. Already aligned with the Vite build (`vite.config.ts`), supports TS out of the box, has a Jest-compatible API.
2. **Component testing:** `@testing-library/react` against React 19 (`react@^19.2.1`).
3. **Chrome API stubs:** `@types/chrome` is already installed; pair with hand-written mocks or `sinon-chrome`.
4. **Supabase mocks:** Wrap Supabase access behind small repository helpers so tests can swap them — current code calls `supabase.from(...)` directly inside `src/lib/auth.ts` and `server/index.ts`, which is hard to mock cleanly.
5. **Replace the placeholder `test` script** in `package.json` with the real runner invocation, and add a `typecheck` script (`tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.server.json`) since neither config currently has a dedicated lint/typecheck step exposed.
6. **Add CI** (e.g., a GitHub Actions workflow at `.github/workflows/ci.yml`) that runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on every PR.

---

*Testing analysis: 2026-05-03*
