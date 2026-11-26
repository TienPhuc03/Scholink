import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Gateway chạy ở :3000 (Scholink/backend). Proxy để gọi API cùng origin, không lo CORS.
const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': GATEWAY, '/health': GATEWAY },
  },
  preview: {
    port: 4173,
    proxy: { '/api': GATEWAY, '/health': GATEWAY },
  },
});
