import { defineConfig } from 'vitest/config';

// Coding fixtures intentionally contain failing Node tests; the harness suite is separate.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
