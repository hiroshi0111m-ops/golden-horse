# Installation verification — 2026-10-22 JST

Environment: Node.js 24.19.0; Astro 7.4.2; EmDash 1.3.1; @astrojs/node 11.1.9; @astrojs/react 7.1.1; React/React DOM 19.3.1. Versions are pinned in package.json and package-lock.json.

## Completed

- Installed the six application dependencies; npm resolved all requested peer dependencies.
- Generated the local encryption key in ignored `.env`; its value is not included in source or this report.
- `npm run build`: exit 0. Upstream admin bundles trigger a non-blocking Vite chunk-size warning.
- `npm test`: 7 tests passed, 0 failures (six HTTP subtests and their parent).
  - Japanese entry page links to actual CMS routes.
  - Published-post collection returns a useful empty state.
  - Published fixture title renders; a draft does not; script text is escaped.
  - Setup API confirms the owner has not yet registered and passkey mode is selected.
  - Admin route serves its React application HTML.
  - Unauthenticated requests to the user-management API are forbidden.
- Tests use temporary SQLite content and remove that fixture afterward.
- An independent read-only code review found no Critical or Important issues.
- Git staging excludes `.env`, SQLite databases, uploads, dependencies and build output.

## Limits and remaining owner actions

- Browser-rendered UI and passkey enrollment were not verified: the internal preview/browser route was blocked by the verification environment. HTTP serving does not prove client-side hydration.
- Docker/Compose files are provided but Docker is unavailable here, so container execution was not verified.
- The smoke suite is not a complete authorization audit of every upstream EmDash endpoint. Private-content/configuration APIs and deliberately induced query failures are not individually exercised; the source throws returned collection errors.
- No administrator or passkey has been pre-created. The owner performs that step on their own device.
- No production hosting URL has been deployed. Running the application on a phone requires a Node host with persistent storage, HTTPS and the exact EMDASH_SITE_URL value.
- No existing game deployment or quantum plugin integration is changed by this source addition.

## GitHub handoff

Saved under `apps/emdash-cms` on branch `codex/emdash-cms-20261022`. Draft PR: https://github.com/hiroshi0111m-ops/golden-horse/pull/39 . Existing main-branch source is preserved.
