import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app at https://<user>.github.io/<repo>/ (spec §13).
const BASE = '/rouge/';

const THEME_LIGHT = '#fbf8f5';

/**
 * Spec §10: a restrictive Content Security Policy allowing only this site and the
 * Supabase project. Added to production builds only — Vite's dev server needs inline
 * scripts and a websocket for hot reload.
 */
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  let origin = '';
  if (supabaseUrl) {
    try {
      origin = new URL(supabaseUrl).origin;
    } catch {
      throw new Error(`VITE_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
    }
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self'${origin ? ` ${origin}` : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'rouge-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: BASE,
    plugins: [
      react(),
      contentSecurityPolicy(env.VITE_SUPABASE_URL),
      VitePWA({
        registerType: 'autoUpdate',
        // A separate registerSW.js file (not an inline script) so the CSP can stay strict.
        injectRegister: 'script',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Rouge',
          short_name: 'Rouge',
          description: 'A private period and cycle tracker.',
          lang: 'en',
          start_url: BASE,
          scope: BASE,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: THEME_LIGHT,
          background_color: THEME_LIGHT,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Precache everything the app needs, so it works fully offline.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          navigateFallback: `${BASE}index.html`,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
