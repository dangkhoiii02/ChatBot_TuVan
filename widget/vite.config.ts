import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
    // Allow embedding from Pancake / extension iframe parents
    headers: {
      'Content-Security-Policy': "frame-ancestors *",
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
    headers: {
      'Content-Security-Policy': "frame-ancestors *",
    },
  },
});
