import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const LIMITS = {
  fallback: 150_000,
  world: 250_000,
  totalJsCss: 400_000,
  homepageMedia: 300_000,
};

const JS_CSS = new Set(['.js', '.css']);
const MEDIA = new Set([
  '.avif',
  '.eot',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
]);
const BASE_URL = 'https://notanastronaut.local/';

function* walk(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

function gzipBytes(path) {
  return gzipSync(readFileSync(path)).length;
}

function assetName(dist, path) {
  return relative(dist, path).split(sep).join('/');
}

function stripRefNoise(pathname) {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}

export function normalizeAssetRef(ref, from = 'index.html') {
  const value = ref.trim();
  if (!value || value.startsWith('#') || value.startsWith('data:')) return null;
  if (/^(?:mailto|tel):/i.test(value)) return null;

  let url;
  try {
    url = new URL(value, new URL(from, BASE_URL));
  } catch {
    return null;
  }

  const normalized = stripRefNoise(url.pathname).replace(/^\/+/, '');
  return normalized.startsWith('assets/') ? normalized : null;
}

function addSrcsetRefs(refs, srcset, from) {
  for (const candidate of srcset.split(',')) {
    const ref = candidate.trim().split(/\s+/)[0];
    if (!ref) continue;
    const normalized = normalizeAssetRef(ref, from);
    if (normalized) refs.add(normalized);
  }
}

export function homepageAssetRefs(html) {
  const refs = new Set();
  for (const match of html.matchAll(/\b(?:src|href|poster)=["']([^"']+)["']/g)) {
    const normalized = normalizeAssetRef(match[1] ?? '');
    if (normalized) refs.add(normalized);
  }
  for (const match of html.matchAll(/\b(?:srcset|imagesrcset)=["']([^"']+)["']/g)) {
    addSrcsetRefs(refs, match[1] ?? '', 'index.html');
  }
  return refs;
}

export function cssAssetRefs(css, cssPath) {
  const refs = new Set();
  for (const match of css.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^'")]+))\)/g)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    const normalized = normalizeAssetRef(raw, cssPath);
    if (normalized) refs.add(normalized);
  }
  return refs;
}

function readManifest(dist) {
  const path = join(dist, '.vite', 'manifest.json');
  if (!existsSync(path)) {
    throw new Error('Missing dist/.vite/manifest.json. Vite build.manifest must stay enabled for budget checks.');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function chunkFiles(chunk) {
  return [
    chunk.file,
    ...(chunk.css ?? []),
    ...(chunk.assets ?? []),
  ].filter(Boolean);
}

function collectManifestAssets(manifest, startKeys, { includeDynamic }) {
  const seenKeys = new Set();
  const assets = new Set();
  const visit = (key) => {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    for (const file of chunkFiles(chunk)) assets.add(file);
    for (const imported of chunk.imports ?? []) visit(imported);
    if (includeDynamic) {
      for (const imported of chunk.dynamicImports ?? []) visit(imported);
    }
  };
  for (const key of startKeys) visit(key);
  return assets;
}

function directDynamicImports(manifest, startKeys) {
  const seenKeys = new Set();
  const dynamic = new Set();
  const visitStatic = (key) => {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    for (const imported of chunk.dynamicImports ?? []) dynamic.add(imported);
    for (const imported of chunk.imports ?? []) visitStatic(imported);
  };
  for (const key of startKeys) visitStatic(key);
  return dynamic;
}

function mediaRefsFromCssFiles(dist, cssFiles) {
  const refs = new Set();
  for (const file of cssFiles) {
    const path = join(dist, file);
    if (!existsSync(path)) continue;
    for (const ref of cssAssetRefs(readFileSync(path, 'utf8'), file)) {
      if (MEDIA.has(extname(ref))) refs.add(ref);
    }
  }
  return refs;
}

export function measureBudgets({ dist = join(process.cwd(), 'dist') } = {}) {
  const homepage = join(dist, 'index.html');
  if (!existsSync(dist) || !existsSync(homepage)) {
    throw new Error('Missing dist/index.html. Run `npm run build` before `npm run budgets`.');
  }

  const manifest = readManifest(dist);
  const files = [...walk(dist)];
  const fileSizes = new Map(files.map((path) => [assetName(dist, path), gzipBytes(path)]));
  const html = readFileSync(homepage, 'utf8');

  const entryKeys = Object.entries(manifest)
    .filter(([, chunk]) => chunk.isEntry)
    .map(([key]) => key);
  if (entryKeys.length === 0) throw new Error('Vite manifest has no entry chunk.');

  const fallbackAssets = collectManifestAssets(manifest, entryKeys, { includeDynamic: false });
  // Everything dynamically imported from the entry is the lazy "world" bundle,
  // regardless of how Rollup keys the chunk (it may hoist to a shared _name).
  const worldRoots = [...directDynamicImports(manifest, entryKeys)];
  const worldAssets = collectManifestAssets(manifest, worldRoots, { includeDynamic: true });

  let fallback = gzipBytes(homepage);
  let world = 0;
  let totalJsCss = 0;

  for (const [name, size] of fileSizes) {
    const ext = extname(name);
    if (!JS_CSS.has(ext)) continue;
    totalJsCss += size;
    if (fallbackAssets.has(name)) fallback += size;
    if (worldAssets.has(name) && !fallbackAssets.has(name)) world += size;
  }

  const homepageMediaRefs = new Set([...homepageAssetRefs(html)].filter((ref) => MEDIA.has(extname(ref))));
  const fallbackCss = [...fallbackAssets].filter((file) => extname(file) === '.css');
  for (const ref of mediaRefsFromCssFiles(dist, fallbackCss)) homepageMediaRefs.add(ref);
  for (const file of fallbackAssets) {
    if (MEDIA.has(extname(file))) homepageMediaRefs.add(file);
  }

  let homepageMedia = 0;
  for (const ref of homepageMediaRefs) {
    homepageMedia += fileSizes.get(ref) ?? 0;
  }

  return { fallback, world, totalJsCss, homepageMedia };
}

export function budgetRows(sizes, limits = LIMITS) {
  return [
    ['fallback-first (homepage html + core JS/CSS)', sizes.fallback, limits.fallback, '<'],
    ['world chunk (three + world adapters)', sizes.world, limits.world, '<='],
    ['total JS+CSS', sizes.totalJsCss, limits.totalJsCss, '<='],
    ['homepage images+fonts', sizes.homepageMedia, limits.homepageMedia, '<='],
  ];
}

export function runCli() {
  let failed = false;
  try {
    for (const [label, size, limit, comparator] of budgetRows(measureBudgets())) {
      const ok = comparator === '<' ? size < limit : size <= limit;
      if (!ok) failed = true;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${(size / 1000).toFixed(1)} KB / ${comparator} ${(limit / 1000).toFixed(0)} KB`);
      if (!ok) {
        console.error(`Budget exceeded: ${label} is ${size} gzip bytes; limit is ${comparator} ${limit} gzip bytes.`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(err instanceof Error ? err.message : String(err));
  }
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
