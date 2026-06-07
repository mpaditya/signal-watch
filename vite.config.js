import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from mpaditya.github.io/signal-watch/
// The base path ensures all asset URLs (JS, CSS, images) are prefixed
// with /signal-watch/ so they resolve correctly in production.
// In dev mode (npm run dev), Vite ignores this and serves from root.
export default defineConfig({
  plugins: [react()],
  base: '/signal-watch/',
  // Vitest config — jsdom gives component tests a simulated DOM + localStorage.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    // Run every *.test.{js,jsx} under src/. All test files now use vitest's
    // describe/it/expect and import the REAL modules (no inline copies).
    include: ['src/**/*.test.{js,jsx}'],
    // Exclude stray agent worktrees + build output from the test run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
});
