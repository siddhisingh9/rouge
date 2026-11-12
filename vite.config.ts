import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base` and vite-plugin-pwa are configured in Milestone 7 (GitHub Pages deploy).
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
