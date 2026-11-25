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

## PR-01 review fixes (G1) — observed 2026-11-25

- Native review (risk + reliability lenses) approved; four non-blocking findings; the maintainer approved fixing three.
- `engines.node` is now `^24.15.0`; `.nvmrc` stays `24.15.0`; `engine-strict=true` kept. Railpack docs state Node is resolved from `RAILPACK_NODE_VERSION`, then `devEngines.runtime`, then `.nvmrc`/`engines.node`; a public forum report shows a deploy silently falling back to Node 18 despite `engines.node`. **Railway compatibility is therefore documented but unverified until PR-02**, which must check the Node version actually used by the build.
- **Finding while verifying `engine-strict`:** pnpm 12 ignored `engine-strict` and `save-exact` in `.npmrc` (`pnpm config get` returned `undefined`, and `pnpm install` under Node 26.1.0 succeeded). Both settings moved to `pnpm-workspace.yaml` (`engineStrict: true`, `saveExact: true`) and `.npmrc` was removed. Verified: `pnpm install --frozen-lockfile` under Node 26.1.0 now fails with `ERR_PNPM_UNSUPPORTED_ENGINE` (wanted `^24.15.0`); under Node 24.15.0 it passes.
- `PORT` validation is now strict decimal digits in 1–65535 (default 3000 only when unset). Test-first: 4 new cases failed before the fix (empty, whitespace, zero, `1e3`), all pass after.

## PR-02 (Railway early deployment) — observed 2026-11-25

- **GitHub:** public repo `fmurillodev/fly-next` created with `gh`; `main` (PR-00) and `feat/monorepo-foundation` pushed; PR #1 opened. History and tracked files audited before publishing: no secrets, PDFs, private harness artifacts or personal paths; the only personal datum is the maintainer-approved author email. **GitHub Actions run 45665610724 on SHA `87f96244b2844e9298f09cfe9230076ca1a738f0` concluded `success`** (`pnpm install --frozen-lockfile`, `pnpm check`). `main` has no workflow, so pushing it ran no CI.
- **Railway account:** Railway CLI 5.71.0; workspace `fmurillodev's Projects` (team); plan `HOBBY`, customer `ACTIVE` (read through `railway api`). Plan facts from Railway docs: $5/month subscription including $5 of usage; builds are free; RAM $10/GB/month, CPU $20/vCPU/month, egress $0.05/GB. No plan change, payment method or add-on was needed. Actual cost of this service was not measured; it shares the workspace's included usage with 4 other projects.
- **Config-as-code finding:** the CLI warned that `railway.json` is deprecated; docs state new services cannot use it and existing files stop being read on 2026-12-01. A `railway.json` was written, committed locally, then removed before publishing; build/start/health settings were applied on the service through the Railway MCP `update_service` tool.
- **Deployed commit:** `e7ffb2df7202ff1d7d12c133552228fa9e4daafa` (`feat/railway-deployment`), uploaded from a clean working tree with `railway up`; deployment `8e462997-e14d-4331-b903-68fee81a258b` → `SUCCESS`.
- **Effective versions (build log):** node 24.15.0 and pnpm 12.16.1 (resolved through idiomatic version files while `RAILPACK_NODE_VERSION=24.15.0` was also set; the build log does not say which source won); `pnpm install --frozen-lockfile --prefer-offline`; build log warning: "could not detect pnpm lockfile version" (install still succeeded). **Runtime (startup log):** `node="v24.15.0" env="production"`, listening on port 8080 injected by Railway.
- **Smoke test (curl, public HTTPS):** `GET /health` → `HTTP/2 200 {"status":"ok"}`; unknown route → 404 JSON without stack trace; `http://` → 301 to `https://`. Railway's health check request (`healthcheck.railway.app`) returned 200 in the deploy log and the deployment became `SUCCESS`.
- **Not verified:** a pushed-branch CI run for the PR-02 branch; the exact cost incurred.

## G2 closure — observed 2026-11-25

- **Integration (merge commits, no squash/rebase):** PR #1 → `9de804b`; PR #2 retargeted to `main` (its diff held only `e7ffb2d` and `44b0d91`, 5 files) and merged → `212247e`. Branches were not deleted.
- **CI:** PR #1 head `87f9624` success (run 45665610724); PR #2 on the new base, head `44b0d91`, success (run 45667467835, started by closing/reopening the PR because a base change does not trigger CI); `main` push runs: `9de804b` success (45667365486), `212247e` success (45667589557).
- **Deployed vs main:** deployed SHA `e7ffb2d`; `main` is `212247e`. `git diff e7ffb2d origin/main` outside `docs/` and `odd/` is empty, so no redeploy was needed.
- **Final smoke:** `GET https://flynext-api-production.up.railway.app/health` → `HTTP/2 200 {"status":"ok"}`; latest deployment `8e462997-…` `SUCCESS`; the deploy log holds one "runtime ready" line.
- **Not verified independently:** Hobby plan and pricing facts, service variables, absence of databases/volumes, image retention, absence of GitHub auto-deploy, and the commit SHA associated with the Railway deployment (the CLI shows ID and status only).
- **Pending (non-blocking):** rate limiting and security headers (PR-04); pnpm "could not detect lockfile version" warning; real service cost not measured.

## Pending evaluations

- PR-01: trusted modern-TypeScript skill (provenance, license, version, content, compatibility).
- PR-05: GoogleChrome modern-web-guidance (not installed; provenance/version/privacy/registry checks first), frontend-design, web-design-guidelines, vercel-react-best-practices, Tailwind CSS v4 skill, Playwright MCP.
