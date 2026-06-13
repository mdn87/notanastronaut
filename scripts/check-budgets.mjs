import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = join(process.cwd(), 'dist');
const homepage = join(dist, 'index.html');

const LIMITS = {
  fallback: 150_000,
  world: 250_000,
  totalJsCss: 400_000,
  homepageMedia: 300_000,
};

const WORLD_CHUNK = /^(?:three|mount|wire|world|scene)[-.]/;
const FALLBACK_CHUNK = /^index[-.]/;
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

function assetName(path) {
  return relative(dist, path).split(sep).join('/');
}

function basename(path) {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function homepageAssetRefs(html) {
  const refs = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (ref?.startsWith('/assets/')) {
      refs.add(ref.slice(1));
    }
  }
  return refs;
}

function cssAssetRefs(css, cssPath) {
  const refs = new Set();
  const cssDir = cssPath.slice(0, cssPath.lastIndexOf('/') + 1);
  for (const match of css.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^'")]+))\)/g)) {
    const raw = match[1] ?? match[2] ?? match[3];
    const ref = raw?.trim();
    if (!ref || ref.startsWith('data:') || /^[a-z]+:/i.test(ref)) continue;
    if (ref.startsWith('/assets/')) {
      refs.add(ref.slice(1));
    } else {
      refs.add(new URL(ref, `file:///${cssDir}`).pathname.slice(1));
    }
  }
  return refs;
}

if (!existsSync(dist) || !existsSync(homepage)) {
  console.error('Missing dist/index.html. Run `npm run build` before `npm run budgets`.');
  process.exit(1);
}

const files = [...walk(dist)];
const html = readFileSync(homepage, 'utf8');
const homepageRefs = homepageAssetRefs(html);
const homepageMediaRefs = new Set([...homepageRefs].filter((ref) => MEDIA.has(extname(ref))));

let fallback = gzipBytes(homepage);
let world = 0;
let totalJsCss = 0;
let homepageMedia = 0;

for (const path of files) {
  const name = assetName(path);
  const base = basename(name);
  const ext = extname(name);
  const size = gzipBytes(path);

  if (JS_CSS.has(ext)) {
    totalJsCss += size;

    if (WORLD_CHUNK.test(base)) {
      world += size;
    } else if (FALLBACK_CHUNK.test(base) || homepageRefs.has(name)) {
      fallback += size;
      if (ext === '.css') {
        const css = readFileSync(path, 'utf8');
        for (const ref of cssAssetRefs(css, name)) {
          if (MEDIA.has(extname(ref))) homepageMediaRefs.add(ref);
        }
      }
    }
  }
}

for (const path of files) {
  const name = assetName(path);
  if (homepageMediaRefs.has(name)) {
    homepageMedia += gzipBytes(path);
  }
}

const rows = [
  ['fallback-first (homepage html + core JS/CSS)', fallback, LIMITS.fallback, '<'],
  ['world chunk (three + world adapters)', world, LIMITS.world, '<='],
  ['total JS+CSS', totalJsCss, LIMITS.totalJsCss, '<='],
  ['homepage images+fonts', homepageMedia, LIMITS.homepageMedia, '<='],
];

let failed = false;
for (const [label, size, limit, comparator] of rows) {
  const ok = comparator === '<' ? size < limit : size <= limit;
  if (!ok) failed = true;
  const line = `${ok ? 'OK  ' : 'FAIL'} ${label}: ${(size / 1000).toFixed(1)} KB / ${comparator} ${(limit / 1000).toFixed(0)} KB`;
  console.log(line);
  if (!ok) {
    console.error(`Budget exceeded: ${label} is ${size} gzip bytes; limit is ${comparator} ${limit} gzip bytes.`);
  }
}

process.exit(failed ? 1 : 0);
