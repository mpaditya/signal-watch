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
    // Exclude stray agent worktrees + build output from the test run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // NOTE: goalUtils.test.js and llm.test.js are intentionally NOT in `include`.
    // They are legacy "standalone node script" tests that (a) use a homegrown
    // console.log harness instead of vitest's describe/it, and (b) goalUtils.test.js
    // tests INLINE COPIES of the functions rather than importing goalUtils.js — so it
    // provides zero regression protection for the real module. Both need rewriting to
    // import the real modules under vitest. Tracked as a follow-up. Until then, `npm test`
    // runs only the real vitest suites so green means something.
    include: [
      'src/decisions.test.js',
      'src/supabase.test.js',
      'src/**/*.vtest.{js,jsx}',
    ],
  },
});
