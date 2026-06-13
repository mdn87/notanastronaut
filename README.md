# notanastronaut.com

Portfolio as a 3D line-art star map. Pure deterministic core + three adapters
(three.js world, DOM HUD, prerendered list fallback). *Not actually an astronaut.*

- `npm run dev` — dev server
- `npm test` — core unit + replay tests
- `npm run build` — production build + static prerender of every route
- `npm run e2e` — Playwright smoke + axe scan (needs `npm run build` first)
