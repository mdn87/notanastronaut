import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  optimizeDeps: {
    // Prevent esbuild dep pre-bundling from mangling the wasm-ESM package in dev.
    exclude: ['@dimforge/rapier3d'],
  },
  build: {
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      treeshake: {
        // rapier_wasm3d.js has a critical side effect (__wbg_set_wasm call) that
        // Rollup would otherwise optimize away when resolving the re-export chain.
        moduleSideEffects: (id) => id.includes('rapier_wasm3d'),
      },
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
