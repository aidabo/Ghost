<!-- Copilot instructions for the Ghost monorepo (customized) -->
# Copilot / AI Assistant Instructions

This file gives targeted, actionable guidance for an AI coding agent working in this Ghost monorepo (located at `ghost/` and `apps/` under the repo root). Focus on discoverable conventions and concrete examples the project uses.

1) Big picture & layout
- **Monorepo**: root `package.json` uses Yarn workspaces and `nx`. Main workspace globs: `ghost/*`, `apps/*`.
- **Core server**: `ghost/core/core/server` contains the NodeJS backend (Bookshelf + Knex). Models live in `ghost/core/core/server/models`.
- **Admin & frontends**: frontend apps are under `ghost/*` and `apps/*` (look for `apps/*` and `ghost/admin`).
- **Build & tooling**: `nx` is the orchestrator. Many commands in the root `package.json` call `nx run-many` or scripts under `.github/scripts`.

2) Key developer workflows (commands you can run/mention)
- Install & build: `yarn` then `yarn build` (root). Node version expected: `v20.19.0` (see `README.md`).
- Development: `yarn dev` (runs `.github/scripts/dev.js`). For running only admin or ghost process use `yarn dev:admin` or `yarn dev:ghost`.
- Docker: use `yarn docker:dev`, `yarn docker:build`. Docker compose profile uses `COMPOSE_PROFILES` (example: `COMPOSE_PROFILES=ghost docker compose up`).
- Tests: `yarn test` (NX-driven). Unit/browser tests are exposed: `yarn test:unit`, `yarn test:browser`. There are also containerized test helpers: `yarn docker:test:unit`.
- Migrations/DB: `yarn knex-migrator` delegates to the ghost workspace. Migration files are under `ghost/core/core/server/data/migrations` and `MigratorConfig.js` configures paths.
- Generate dev data: `yarn reset:data` runs `ghost/core/index.js generate-data` (useful for populating large local datasets).

3) Project-specific code patterns & conventions
- **Bookshelf models**: models extend `ghostBookshelf.Model` (example: `ghost/core/core/server/models/post.js`). Common hooks:
  - `defaults()` for model-level defaults (why: Knex insert only returns id — models re-fetch expected fields).
  - `parse()` and `formatOnWrite()` handle canonicalization of URLs; `__GHOST_URL__` transform-ready format is used throughout.
  - `permittedAttributes()` includes `relationships` entries so nested relations are preserved when writing.
- **URL transformation**: when writing to DB, code uses helper methods like `urlUtils.toTransformReady` and the inverse on read (`transformReadyToAbsolute`). Search `formatOnWrite` implementations.
- **Feature flags / labs**: runtime flags live in `shared/labs` and are often consulted inside server code (guard new behaviour behind `labs` checks).
- **Revisions & limits**: post and mobiledoc revision constants live near models (e.g., `MOBILEDOC_REVISIONS_COUNT`, `POST_REVISIONS_COUNT`) — prefer config/constants in-place rather than magic numbers.
- **Direct Knex for heavy ops**: Some costly updates use `ghostBookshelf.knex.raw(...)` within model methods to avoid triggering hooks repeatedly — follow the same approach for large migrations.

4) Integration points & external dependencies
- **Tinybird**: used for analytics; scripts available (`tb`, `tb:local`). See `package.json` scripts and `ghost/core/core/server/data/tinybird` paths.
- **Sentry & tracing**: Sentry integration exists for Knex in `core/shared/SentryKnexTracingIntegration.js` — instrumented at boot.
- **Email / newsletters**: models and services for emails/newsletters live under `ghost/core/core/server` (`email-service`, `newsletter` models).

5) Where to look for authoritative examples
- Model patterns: `ghost/core/core/server/models/post.js` (parse/formatOnWrite/defaults/relations examples).
- DB connection & CLI: `ghost/core/core/cli/*` and `ghost/core/core/server/data/db/connection.js`.
- Dev orchestration script: `.github/scripts/dev.js` (entrypoint for `yarn dev`, browser-tests, etc.).
- Root scripts and NX usage: `package.json` at repo root and `nx.json` for concurrency/workspace settings.

6) Linting, pre-commit, and style
- ESLint with `eslint-plugin-ghost` is enforced. Husky + lint-staged installed via `prepare` script. Respect existing ESLint rules and formatting.

7) Safety & editing guidance for the AI
- Do not assume schema changes are instantaneous: database migrations and `knex` operations must be verified against `core/server/data/migrations` and tested locally (or run in CI).
- Avoid bulk updates that trigger model hooks unless the file explicitly shows `knex.raw` usage for that case (search for `knex.raw('UPDATE` in models).
- When changing defaults or URLs, update both `schema` defaults (migrations) and the model `defaults()` or `formatOnWrite()` to keep DB and model layer in sync.

If anything here is unclear or you want me to add examples for a specific package (for example `apps/portal` or `ghost/admin`), tell me which area to expand and I will iterate.
