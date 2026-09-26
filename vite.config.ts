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
        description: 'Planning des repas de la semaine, frigo anti-gaspi et liste de courses pour deux.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f1f5',
        theme_color: '#f3f1f5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff,woff2}'],
        // Les moteurs de scan (plusieurs Mo) ne sont pas pré-téléchargés :
        // ils sont mis en cache à la première utilisation, puis disponibles hors ligne.
        // Idem pour le lecteur de PDF (tickets en ligne).
        globIgnores: ['scan/**', 'assets/pdf*'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/scan/'),
            handler: 'CacheFirst',
            options: { cacheName: 'popote-scan', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }) => /\/assets\/pdf/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'popote-pdf', expiration: { maxEntries: 6 } },
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
