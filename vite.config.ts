/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Sur GitHub Pages, le site est servi sous /<nom-du-depot>/.
// Le workflow définit BASE_PATH ; en local on reste à la racine.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Popote — repas & courses',
        short_name: 'Popote',
        description: 'Planning des repas du samedi au mercredi et liste de courses pour deux.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f3ee',
        theme_color: '#1f4e5f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Les moteurs de scan (plusieurs Mo) ne sont pas pré-téléchargés :
        // ils sont mis en cache à la première utilisation, puis disponibles hors ligne.
        globIgnores: ['scan/**'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/scan/'),
            handler: 'CacheFirst',
            options: { cacheName: 'popote-scan', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
