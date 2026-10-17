import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the app shell only; fetchJson owns data caching. The lazy 3D chunk is cached on first use instead.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['data/**', '**/BuildScene-*.js'],
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [{ urlPattern: /\/assets\/BuildScene-[^/]*\.js$/, handler: 'CacheFirst', options: { cacheName: 'scene-chunk' } }],
      },
      manifest: {
        name: 'PC Part Tracker', short_name: 'PC Parts', display: 'standalone',
        start_url: './', scope: './', background_color: '#0f1115', theme_color: '#2456d6',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', exclude: [...configDefaults.exclude, 'e2e/**'] },
})
