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

## PR-03 (domain decision engine) — observed 2026-11-25

- **Dependencies:** none added; `zod` (already pinned) is used only in `infrastructure/` mappers. `domain/` and `application/` import no framework (grep for `fastify|axios|react|pino|zod|node:` over both directories: no matches, tests excluded). No ambient clock (`Date.now`/`new Date()`): none in the new code.
- **Context7 / external docs:** not consulted (no concrete need; `Intl.DateTimeFormat` `longOffset` is part of ECMA-402 and verified by tests against 2026-09-05/07 and 2026-09-15 offsets).
- **Test-first evidence:** (1) core suites (`time`, `reconciliation`, `connection`, `classification`) written first: `4 failed | 1 passed` (modules missing), then `5 files / 57 tests` passed; (2) policy/alternatives/recommendation suites: `3 failed | 5 passed (8 files)`, then 4 failures from the first implementation (one real bug: reachability reported `NOT_REACHABLE` on top of `DEPARTED`; one test-helper bug that duplicated rule ids) fixed → `117 passed`; (3) use-case and mapper suites: `2 failed | 8 passed`, then `10 files / 155 tests` passed. RED here is "module does not exist" plus the 4 observed assertion failures; no artificial behavioral RED was staged for the other suites.
- **Mutation check (one, manual):** changing the R1 threshold from 180 to 181 made `a confirmed 180-minute delay is APPLICABLE` fail (1 failed | 154 passed); reverted.
- **Checks:** `pnpm check` exit 0 under Node v26.13.0 (the active shell version, not the pinned one) **and** under Node 24.15.0 (`nvm use`): lint, typecheck, 155 api + 2 contracts tests, build. `git diff --check` clean. `build:api`/`build:web` unaffected: the API entry (`server.ts`) does not import the domain yet, so the bundle is unchanged until PR-04.
- **Not verified:** CI for this branch (nothing pushed); behavior under the real Railway runtime; the domain has not run behind HTTP.

## PR-03 G3 refinement — observed 2026-11-25

- **Native review (RDD):** consent `granted` by the maintainer for the 3.5k-line candidate (risk medium). One reliability-lens model run via the Pi host relay (about 48 s) returned `approved` with one non-blocking `WARNING`: future-dated timestamps pass as fresh (`time.ts`). Approval acknowledged and its authority burned. Review outcomes never authorize delivery.
- **Test-first (P5, P13):** the new/rewritten tests failed first: `7 failed | 157 passed` (boundaries 69/70/71-minute delay, unconfirmed cancellation as evidence, confirmed-arrival cases, small delay end to end, future timestamps), then `163 passed` after the change; an obsolete expectation (secondary cancellation → `UNKNOWN`) contradicted the approved P5 and was removed. Scheduled facts on `SegmentAssessment`: 1 failed → `163 passed`.
- **Checks:** `pnpm check` exit 0 and `git diff --check` clean after the code commits (Node v26.13.0 active shell). Structured fields of the DTO examples were cross-checked by running the engine for ABC123/DEMO01/DEMO02.
- **Not verified:** the Spanish message texts have no composer or tests yet (PR-04); CI not run (nothing pushed).

## Pending evaluations

- PR-01: trusted modern-TypeScript skill (provenance, license, version, content, compatibility).
- PR-05: GoogleChrome modern-web-guidance (not installed; provenance/version/privacy/registry checks first), frontend-design, web-design-guidelines, vercel-react-best-practices, Tailwind CSS v4 skill, Playwright MCP.

## PR-04 local API verification — observed 2026-11-25



- Node 24.15.0 via nvm and pnpm 12.16.1. Preflight: 173 API and 2 contract tests on the approved main SHA. Final: frozen install, pnpm check (259 API and 50 contracts), independent API and web builds, and git diff --check passed.

- Fastify injection exercised strict requests, prior health behavior, normalized errors, provider degradation, correlation, logging privacy, rate limiting, and Swagger. Independent pre/post probes verified the three validation corrections and confirmed departure copy.

- Local TCP smoke verified the built server, all three public fixtures against Zod and the documented examples, Swagger UI and JSON, 400 and 404 problem bodies, Pino records, and Vite forwarding. Swagger was fetched in the smoke; no manual browser interaction was performed.

- Official Swagger compatibility tables confirmed Fastify 5 support; pinned @fastify/swagger 9.9.5 and @fastify/swagger-ui 5.2.6. No runtime Axios client, tool upgrade, external observability system, or Railway deployment. G4 remains open.

## PR-04 native review correction — observed 2026-11-25



- Lineage `review-b9655c1f60225e58`: four lenses plus refuter reported R3-001, R3-002 and R4-001; bounded plan 180 of 200 diff lines; correction commit `93c7ed5` (134 diff lines, frozen paths). Focused RED 10 failed / 74 passed, GREEN 84 passed. Node 24.15.0 / pnpm 12.16.1: `pnpm check` (276 API + 50 contracts), `pnpm build:api`, `pnpm build:web` and `git diff --check` passed. Targeted validator approved and acknowledgement burned the authority.

- Not corrected, tracked for G4: R1-001 and R4-002 (verify rate-limit peer grouping behind the Railway proxy; the limiter uses the direct peer IP, so no per-client isolation is claimed; `trustProxy` stays off) and R3-003 (limiter window-expiry coverage). The generic 404 is intentionally sanitized and currently has no request ID; adding one is pending a maintainer decision.

## PR-04 merge, deployment and public smoke (G4) — observed 2026-11-25

- **Merge:** PR #4 merged preserving history as `a53fcd83b90f0886d5d18356f9902b46ddc0fd40`; merged tree equals the PR head tree (`331259ba5486b1737365832083c7482b18c0b628`). PR CI run `45694387005` and `main` CI run `45695022430` succeeded. Branch kept.
- **Deployment:** `LOG_LEVEL=info` added (no redeploy), then `railway up --ci -s flynext-api` from a clean `a53fcd8` checkout. Deployment `1322dfe1-614b-470d-acc8-c9f42eab8ff9`: SUCCESS; image digest `sha256:4ee0218104f743373a49bd0ed336bf8d263a76dc95a004a321541b3fb1014117`. Existing project, service, variables and commands; no new resources.
- **Public smoke (HTTPS, synthetic data, about 15 requests):** `/`, `/health`, `/docs`, `/docs/json` as expected; ABC123, DEMO01 and DEMO02 matched the documented outcomes and validated against the shared Zod schema; 400 and 404 problem bodies matched `X-Request-Id`; unknown route returned the sanitized 404 without a request ID; DEMO03–DEMO06 returned 404 `BOOKING_NOT_FOUND`.
- **Observability:** `railway logs --json` showed structured `provider.read` (with `durationMs`), `assessment.completed` and `assessment.data_quality` events carrying the ABC123 `requestId`, and no booking identifiers. Observation not investigated: Railway labelled at least one `assessment.completed` line with `level: error` in its own wrapper.
- **Rate limiting:** no per-client isolation is claimed; independent clients behind the Railway proxy may share the direct-peer budget (60 requests per minute by default). Not exercised to exhaustion.
- **Review coverage:** unchanged from L23: partial native review only. RDD is off for this clone.

## PR-05 passenger experience — observed 2026-11-25

- **Skills evaluated (read-only, not vendored, not installed):** `anthropics/skills` `frontend-design` (commit `e4bb5d9`, Apache-2.0 per its LICENSE.txt); `vercel-labs/agent-skills` `web-design-guidelines` v1.1.0 and `react-best-practices` (commit `5a37a63`; the repository exposes no root license, so nothing was copied); `GoogleChrome/modern-web-guidance` (commit `2b4aa13`, Apache-2.0; consulted for provenance only). Guidance from `frontend-design` and the Web Interface Guidelines shaped the work (one memorable hero, visible focus, reduced motion, semantic labels). No skill installer ran, no MCP was added, the skill registry was not refreshed because nothing was installed.
- **Dependencies added:** `lucide-react` 1.79.0 (icons), `@fontsource-variable/manrope` 5.3.0 (self-hosted font, OFL), `@fastify/static` 10.1.12 (static serving), and dev-only `jsdom` 31.0.1, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.13, `@testing-library/jest-dom` 8.0.0; `vitest` reuses the catalog version and `@flynext/contracts` is now a web workspace dependency. No state, routing, HTTP or animation libraries.
- **Verification:** Node 24.15.0 / pnpm 12.16.1: `pnpm install --frozen-lockfile`, `pnpm check` (50 contracts + 280 API + 10 web tests), `pnpm build:api`, `pnpm build:web`, `pnpm build` and `git diff --check` passed. UI tests were written after the implementation, not test-first; the static integration test was observed RED (500, wrong `@fastify/static` header API) before GREEN.
- **Local smoke of the built service (`node apps/api/dist/server.js`):** `/` 200 HTML, hashed JS/CSS assets 200, `/health`, `/docs/`, `/docs/json` 200, ABC123 PARTIAL/HUMAN_REVIEW, DEMO01 COMPLETE/NO_ACTION_REQUIRED, DEMO02 COMPLETE/REVIEW_REBOOKING_OPTIONS, DEMO03 404, unknown routes keep the sanitized JSON 404.
- **Visual QA:** headless Google Chrome driven over the DevTools protocol (script kept outside the repository). Home and the three public scenarios at 375, 390, 768, 1024 and 1440 px showed no horizontal overflow; screenshots of the home and ABC123 at 375 and 1440 px are in `docs/evidence/screenshots/`. Keyboard flow, contrast ratios and a screen reader were not audited with dedicated tools; focus rings, labels, `role=status`/`alert` and reduced-motion rules are implemented and covered only by unit tests.
- **Deployment note:** the Railway build command already runs `pnpm build`, so the next deploy will include the frontend; nothing was deployed in this PR.

