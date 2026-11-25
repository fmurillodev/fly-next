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

## Pending evaluations

- PR-01: trusted modern-TypeScript skill (provenance, license, version, content, compatibility).
- PR-05: frontend-design, web-design-guidelines, vercel-react-best-practices, Tailwind CSS v4 skill, Playwright MCP.
