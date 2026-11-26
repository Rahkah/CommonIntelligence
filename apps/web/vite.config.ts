import { readdirSync, rmSync, utimesSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * Keep dist/index.html intact across live rebuilds so a running `wrangler dev`
 * static-assets watcher never indexes an emptied dist/ and gets stuck on 404.
 */
function preserveLiveDistAssets(): Plugin {
  let outDir = '';
  return {
    name: 'preserve-live-dist-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      const emittedAssets = new Set(
        Object.keys(bundle)
          .filter((key) => key.startsWith('assets/'))
          .map((key) => basename(key))
      );
      const assetsDir = join(outDir, 'assets');
      try {
        for (const entry of readdirSync(assetsDir)) {
          if (!emittedAssets.has(entry)) {
            rmSync(join(assetsDir, entry), { force: true });
          }
        }
      } catch {
        // Ignore if assets directory does not exist yet
      }
    },
    closeBundle() {
      const indexPath = join(outDir, 'index.html');
      try {
        const now = new Date();
        utimesSync(indexPath, now, now);
      } catch {
        // Ignore when not emitting index.html
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), preserveLiveDistAssets()],
  build: {
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '^/challenges/[^/]+/join\\.txt$': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
