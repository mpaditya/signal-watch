import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from mpaditya.github.io/signal-watch/
// The base path ensures all asset URLs (JS, CSS, images) are prefixed
// with /signal-watch/ so they resolve correctly in production.
// In dev mode (npm run dev), Vite ignores this and serves from root.
export default defineConfig({
  plugins: [react()],
  base: '/signal-watch/',
});
