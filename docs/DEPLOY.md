# Deploy notes — notanastronaut.com

## How it goes live
- Hosted on **Cloudflare** (Pages/Workers) connected to the GitHub repo
  **`mdn87/newman.foo`** — remote `origin`
  (`https://github.com/mdn87/newman.foo.git`).
- **Pushing to `master` deploys to production immediately.** Cloudflare builds
  `npm run build` (`vite build && tsx scripts/prerender.ts`) → output `dist/`.
- CI (`.github/workflows/ci.yml`) runs typecheck + unit + build + budgets + e2e on
  push/PR — it verifies; Cloudflare does the deploy.

Confirm on Cloudflare (not visible from the repo): Pages vs Workers, production
branch, build command/output dir, and the `notanastronaut.com` domain mapping.

## ⚠️ Deploy-safety workflow (master = live)
Because `master` auto-deploys, **do not push substantive work straight to
`master`.** Instead:

1. Work on a feature branch.
2. `git push -u origin <branch>` — Cloudflare builds a **preview** deploy for the
   branch/PR (production untouched).
3. Review the preview, then **ask before merging to `master`** — merging is what
   goes live.

See `CLAUDE.md` (project root) for this as an enforced project rule.

## History note (2026-06-28)
This working copy and the deploy repo originally had **unrelated git histories**.
The local free-fly galaxy game replaced the previous `newman.foo/master` (the old
node-snap flythrough + a separate "galaxy prototype"). Local `master` is now the
deploy source (`origin/master` == local `master`).

The replaced history is preserved and fully recoverable:
- Remote tags: `archive/newman-master-pre-freefly` (`c282dcd`, old master tip) and
  `archive/newman-codex-prototype` (`aab1897`).
- Untouched branch: `origin/codex/spiral-galaxy-game-prototype` (the parallel
  Codex galaxy prototype).
- Local bundle: `../newman.foo-original-backup-20260628.bundle`.

### Roll back to the old site
```bash
git push --force origin archive/newman-master-pre-freefly:master
```
(Note: a force-push may be blocked by the local tooling guardrail; run it from a
plain terminal.)
