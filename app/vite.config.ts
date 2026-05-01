import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Public tunnel behaves like production; disable Vite HMR websocket noise.
    hmr: false,
    proxy: {
      '/nh/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nh\/api/, ''),
      },
    },
  },
})
