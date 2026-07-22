import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // tsconfig.json sets `jsx: "preserve"` for Next.js, but Vitest needs to
  // actually emit JS to load .tsx files that appear in the dependency graph
  // of unit tests (e.g. components/cart-context.tsx via the cart service).
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'tests/**'],
  },
});
