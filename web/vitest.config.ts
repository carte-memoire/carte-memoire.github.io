import { defineConfig } from 'vitest/config';

// Tests du front (npm test) : les modules « purs » de src/lib, sans navigateur ni base.
// Les composants React, eux, sont vérifiés par TypeScript (npm run typecheck) et le lint.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
