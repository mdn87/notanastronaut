import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error The budget checker is a Node ESM script without TS declarations.
import { cssAssetRefs, homepageAssetRefs, measureBudgets } from '../scripts/check-budgets.mjs';

let tempDirs: string[] = [];

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), 'notastro-budget-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, '.vite'), { recursive: true });
  return dir;
}

function writeFile(root: string, name: string, text: string) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function gz(text: string) {
  return gzipSync(text).length;
}

describe('budget checker', () => {
  afterEach(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    tempDirs = [];
  });

  it('uses the Vite manifest graph for world chunks instead of filename prefixes', () => {
    const dist = makeDist();
    const files = {
      'index.html': '<script type="module" src="/assets/index-a.js"></script>',
      'assets/index-a.js': 'console.log("entry");',
      'assets/index-a.css': 'body{color:black}',
      'assets/chunk-alpha.js': 'console.log("world mount");',
      'assets/chunk-alpha.css': '.hud{display:block}',
      'assets/chunk-beta.js': 'console.log("world hud");',
      'assets/vendor-blue.js': 'console.log("three");',
    };
    for (const [name, text] of Object.entries(files)) writeFile(dist, name, text);
    writeFile(dist, '.vite/manifest.json', JSON.stringify({
      'index.html': {
        file: 'assets/index-a.js',
        css: ['assets/index-a.css'],
        isEntry: true,
        dynamicImports: ['src/world/mount.ts'],
      },
      'src/world/mount.ts': {
        file: 'assets/chunk-alpha.js',
        css: ['assets/chunk-alpha.css'],
        isDynamicEntry: true,
        imports: ['src/hud/hud.ts'],
      },
      'src/hud/hud.ts': {
        file: 'assets/chunk-beta.js',
        imports: ['node_modules/three/index.js'],
      },
      'node_modules/three/index.js': {
        file: 'assets/vendor-blue.js',
      },
    }));

    const sizes = measureBudgets({ dist });

    expect(sizes.fallback).toBe(
      gz(files['index.html']) + gz(files['assets/index-a.js']) + gz(files['assets/index-a.css']),
    );
    expect(sizes.world).toBe(
      gz(files['assets/chunk-alpha.js'])
      + gz(files['assets/chunk-alpha.css'])
      + gz(files['assets/chunk-beta.js'])
      + gz(files['assets/vendor-blue.js']),
    );
  });

  it('normalizes homepage media from srcset, relative paths, CSS urls, queries, and hashes', () => {
    expect(homepageAssetRefs(`
      <img srcset="/assets/hero.png?size=1 1x, assets/hero@2x.webp#large 2x">
      <source srcset="assets/hero.avif 1x">
      <link href="assets/fonts/site.woff2?v=2">
      <link href="https://notanastronaut.com/assets/patch.png">
      <img src="/assets/inline.svg#icon">
    `)).toEqual(new Set([
      'assets/hero.png',
      'assets/hero@2x.webp',
      'assets/hero.avif',
      'assets/fonts/site.woff2',
      'assets/patch.png',
      'assets/inline.svg',
    ]));

    expect(cssAssetRefs(`
      @font-face { src: url("font.woff2?v=1"); }
      .hero { background: url('../assets/paper.jpg#hero'); }
    `, 'assets/index-a.css')).toEqual(new Set([
      'assets/font.woff2',
      'assets/paper.jpg',
    ]));
  });

  it('counts homepage media discovered from html, fallback css, and manifest assets', () => {
    const dist = makeDist();
    const files = {
      'index.html': `
        <script type="module" src="/assets/index-a.js"></script>
        <img srcset="/assets/hero.png?size=1 1x, assets/hero@2x.webp#large 2x">
      `,
      'assets/index-a.js': 'console.log("entry");',
      'assets/index-a.css': '@font-face { src: url("font.woff2?v=1"); }',
      'assets/hero.png': 'hero-1x',
      'assets/hero@2x.webp': 'hero-2x',
      'assets/font.woff2': 'font',
      'assets/imported.svg': '<svg></svg>',
    };
    for (const [name, text] of Object.entries(files)) writeFile(dist, name, text);
    writeFile(dist, '.vite/manifest.json', JSON.stringify({
      'index.html': {
        file: 'assets/index-a.js',
        css: ['assets/index-a.css'],
        assets: ['assets/imported.svg'],
        isEntry: true,
      },
    }));

    expect(measureBudgets({ dist }).homepageMedia).toBe(
      gz(files['assets/hero.png'])
      + gz(files['assets/hero@2x.webp'])
      + gz(files['assets/font.woff2'])
      + gz(files['assets/imported.svg']),
    );
  });
});
