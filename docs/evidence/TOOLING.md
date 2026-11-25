# Tooling Evidence

Only facts observed in this repository are recorded. Update per PR; never backfill invented entries.

## Environment (observed 2026-11-25, PR-00)

| Item | Observed |
| --- | --- |
| Harness | Gentle Shell 5.0.0 / Pi 1.6.0 (per maintainer spec; not re-verified via CLI) |
| Active Node | v26.13.0 — **differs from the approved Node 24 LTS**; v24.15.0 is installed under nvm. Pinned in PR-01. |
| pnpm | 12.16.1 (as reported by `pnpm -v`) |
| Git | repo on `main`, no remote; local identity configured at G0 (global untouched) |
| GitHub CLI | installed, authenticated (account name not recorded here) |
| Railway CLI | installed (not used in PR-00) |
| Engram | project detected as `fly-next` (source: git root) |

## Skills

- Registry refreshed with `gentle-ai skill-registry refresh --force` → 14 skills indexed in `.atl/skill-registry.md` (local, git-ignored).
- Skills used in PR-00: `work-unit-commits` (SKILL.md read to plan the PR-00 commit). Other skills were available in the registry but not applied.

## MCPs

Engram used for operational memory. Context7, Railway, CodeGraph: not used in PR-00. No MCPs installed.

## Delegations

None in PR-00.

## Commands run (PR-00)

`pwd`, `git status`, `git branch -a`, `git config` (read-only), `node -v`, `pnpm -v`, `gh auth status`, `gentle-ai skill-registry refresh --force`, `mem_current_project`. Results as summarized above.

G0 closure: `git config --local user.name/user.email` (local identity only; global config untouched); Node `Intl.DateTimeFormat` check of IANA offsets for 2026-09-15/16 (Santiago -03:00, Lima -05:00, Mexico City -06:00); `git diff --cached --check`; staged-content scan for secrets and personal paths (results in the closure report).

## PR-01 (Monorepo Foundation) — observed 2026-11-25

Commands ran under Node v24.15.0 (via `nvm use`; Gentle Shell's own Node untouched) and pnpm 12.16.1.

| Area | Pinned (exact) |
| --- | --- |
| Runtime | Node 24.15.0 (`.nvmrc`, `engines`), pnpm 12.16.1 (`packageManager`) |
| Language/test | typescript 6.0.3, vitest 5.1.2, zod 4.6.7, @types/node 24.19.4 |
| API | fastify 5.12.8 (Pino built in), tsup 9.0.0, tsx 4.23.15 |
| Web | react / react-dom 19.3.1, vite 8.3.8, @vitejs/plugin-react 6.3.0, tailwindcss + @tailwindcss/vite 4.3.5, @types/react 19.3.3, @types/react-dom 19.3.0 |
| Lint/format | eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.74.0, globals 17.14.0, prettier 3.10.1 |
| CI | actions/checkout v7, pnpm/action-setup v6, actions/setup-node v7 (latest majors read via `gh api`) |

Versions are shared through a pnpm catalog (`pnpm-workspace.yaml`) with `save-exact=true`.

Decisions and findings:

- **TypeScript 6.0.3, not 7.0.2 (npm `latest`):** typescript-eslint 8.74.0 declares `typescript >=4.8.4 <6.1.0`. Latest 6.x keeps the lint toolchain supported.
- **@types/node 24.x** matches the Node 24 runtime (the `latest` tag is 26).
- **pnpm supply-chain gate:** pnpm automatically added `minimumReleaseAgeExclude` entries (vitest 5.1.2 and related packages, @types/node 24.19.4, @types/react 19.3.3) because those releases were newer than the default minimum release age. They are pinned exactly and locked.
- **esbuild install script denied** (`allowBuilds: esbuild: false`): its platform binary comes from optional dependencies; build and tests ran without the script.
- **Pino:** used through Fastify's native `logger` option; `base: null` removes pid/hostname from log lines (first smoke run printed the machine's LAN IP as hostname).
- **tsup** builds the API; contracts uses plain `tsc` (types + ESM). The contracts package must be built before API/web consumers resolve it, so root `test` and `typecheck` run `build:contracts` first.
- **Prettier ignores Markdown and `odd/`** so approved documents are not reformatted by tooling.
- `@flynext/web` does not yet depend on `@flynext/contracts`; the dependency will be added when it is used (PR-05).
- **`pnpm start` is provisional:** it starts only the API (`start:api`); no static frontend is served until PR-04/05 integrate `@fastify/static`.
- Context7 consulted: Tailwind CSS v4 Vite plugin, typescript-eslint flat config, Fastify listen/logger/close.
- **TypeScript skill evaluation:** the effective registry (14 skills) contains no TypeScript-specific skill; continued with Context7 and official docs. Nothing installed.

Validations (all real, Node 24.15.0): `pnpm install --frozen-lockfile` OK; `pnpm lint`, `typecheck`, `test` (contracts 2 tests, api 5 tests), `build:api`, `build:web`, `build`, `check` exit 0; `git diff --check` clean; same `pnpm check` exit 0 in a clean local clone of the commit. Build independence from a state without any `dist/`: `build:web` produced only `apps/web/dist`; `build:api` produced `packages/contracts/dist` + `apps/api/dist` and no web output. HTTP smoke: `PORT=3456 pnpm start:api` → `GET /health` = `200 {"status":"ok"}`, unknown route 404, listener bound on all interfaces (`*:3456`), SIGTERM logged "shutting down" and released the port. **GitHub Actions has not run** (no remote exists); `ci.yml` is configured only.

## Pending evaluations

- PR-01: trusted modern-TypeScript skill (provenance, license, version, content, compatibility).
- PR-05: frontend-design, web-design-guidelines, vercel-react-best-practices, Tailwind CSS v4 skill, Playwright MCP.
