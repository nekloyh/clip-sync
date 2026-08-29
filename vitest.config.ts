import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // The room page is a .tsx server component and one test calls it directly to
  // check what it renders — that test is what pins shut the old behaviour where
  // visiting an unknown URL minted a room, so it is worth the setting.
  //
  // Why it is needed: esbuild defaults to the classic JSX transform, which
  // compiles <TextEditor/> to React.createElement and therefore requires React
  // to be in scope. Next's own pages do not import React, so the transform
  // fails. `automatic` uses the jsx-runtime import instead, which is exactly
  // what Next compiles with.
  //
  // Why it cannot affect production: this file is read by vitest and nothing
  // else. `next build` compiles with SWC, configured by next.config.mjs and
  // tsconfig.json (`"jsx": "preserve"`, which hands JSX to SWC untouched);
  // neither of those references vitest.config.ts, and esbuild is not in the
  // build path at all. Removing the setting would break `npm test` and change
  // nothing about the shipped bundle.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws on import outside a React Server Component build.
      // Under vitest we are the server, so stub it out.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
});
