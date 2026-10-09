/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Link-preview tags in index.html need absolute URLs (scrapers ignore relative ones)
  const siteUrl = (env.VITE_SITE_URL || 'http://localhost:8080').replace(/\/$/, '')

  return {
    plugins: [
      react(),
      {
        name: 'site-url',
        transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
      },
    ],
    server: {
      port: 5173,
      // In dev, /api goes to the Nest server so the browser only ever talks to one origin
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Libraries change less often than app code, so they get their own
          // long-cached files. MUI components are left out on purpose: they go
          // with the (lazy) pages that use them, so the login page stays small.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react'
            if (/node_modules\/(@mui\/(system|utils|styled-engine|private-theming)|@emotion|stylis)\//.test(id)) {
              return 'mui-core'
            }
            // zod is only needed by the invoice forms, not the login page
            if (/node_modules\/(zod|@hookform)\//.test(id)) return 'forms'
            if (/node_modules\/(@tanstack|axios|dayjs|react-hook-form)\//.test(id)) return 'vendor'
            return undefined
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Form tests take ~4s on their own but 3x that when every test file renders
      // MUI in parallel, so leave plenty of headroom rather than flake on busy machines
      testTimeout: 30_000,
      // Each test file renders the whole MUI app in its own jsdom; running them all
      // at once starves the CPU and makes first renders slow. Four at a time is
      // about as fast overall and much steadier.
      maxWorkers: 4,
    },
  }
})
