import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { reporter: ['text', 'lcov'], include: ['src/features/**', 'src/lib/**'] },
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
