import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
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
