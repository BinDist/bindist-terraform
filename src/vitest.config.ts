import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest runs the suite as native ESM (via esbuild), which matches this
 * package's `"type": "module"` / NodeNext source. That's why there's no
 * `.js`-extension moduleNameMapper, no esModuleInterop shim, and no CJS uuid
 * stub here — all of which Jest+ts-jest needed only to drag an ESM codebase
 * through a CommonJS runner.
 *
 * Note: Vitest transpiles with esbuild and does NOT type-check the test run.
 * Type errors are caught by the AWS/Scaleway build jobs (`tsc`) in CI.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@functions': fileURLToPath(new URL('./functions', import.meta.url)),
    },
  },
});
