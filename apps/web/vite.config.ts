import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    // Same-origin in development: the SameSite=Strict refresh cookie and Socket.IO both need it.
    // Production does the same with Nginx (infrastructure/docker/web/nginx.conf).
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': { target: API, ws: true },
    },
  },
});
