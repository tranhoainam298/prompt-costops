import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/v1': {
        target: 'http://gateway:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://gateway:8000',
        ws: true,
      },
    },
  },
});
