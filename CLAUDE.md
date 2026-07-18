# notanastronaut.com — project rules

Portfolio as a 3D **free-fly galaxy game** (Vite + three.js). Pilot an arrow-dart
through a dark-cyan-stardust spiral galaxy: WASD/arrows move, drag to steer,
right-click boost. Deterministic cores in `src/core/` (flight, galaxy, grid,
parallax — pure, seeded, unit-tested), three.js adapters in `src/world/`.

## 🚨 Deploy safety — `master` is LIVE
The GitHub remote `origin` = **`mdn87/newman.foo`**, wired to **Cloudflare**.
**Any push to `master` deploys to production (notanastronaut.com) immediately.**

**Therefore, by default:**
- **Do NOT commit substantive work directly to `master`, and do NOT push `master`.**
- Work on a **feature branch**; when a unit of work is validated, **push the
  branch** (`git push -u origin <branch>`) — Cloudflare builds a *preview* deploy,
  production untouched.
- **Ask before merging to `master`** — merging is what goes live. State plainly
  that merging will deploy to production, and wait for an explicit go.
- **Never force-push `master`.** Roll-backs/replacements are archived as tags
  (see `docs/DEPLOY.md`); a force-push is also blocked by local tooling.

This overrides the global "commit/push to main/master freely" guidance for this
repo specifically — here, master == production.

## Workflow
- Verify before pushing a branch: `npm run typecheck && npm test && npm run build && npm run budgets` (e2e: `npm run e2e`).
- Budgets are enforced (`npm run budgets`); keep the world chunk within limit.
- Details + history + rollback: `docs/DEPLOY.md`. Spec/plan: `docs/superpowers/`.
