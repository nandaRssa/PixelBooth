import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true, // expose ke jaringan lokal (iPad access)
    allowedHosts: true, // ijinkan akses via Cloudflare Tunnel
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Target modern browsers — skip legacy polyfills
    target: 'es2020',
    // Smaller sourcemaps in production
    sourcemap: false,
    // Increase chunk warning threshold (our app intentionally has large chunks)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Aggressive manual chunk splitting — heavy libs in separate cached chunks
        manualChunks(id) {
          // React core — changes rarely, cache forever
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react'
          }
          // Router
          if (id.includes('node_modules/react-router')) {
            return 'router'
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack')) {
            return 'query'
          }
          // Framer Motion — large lib, cache separately
          if (id.includes('node_modules/framer-motion')) {
            return 'motion'
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
          // QR code lib
          if (id.includes('node_modules/qrcode')) {
            return 'qr'
          }
          // All other vendor libs
          if (id.includes('node_modules/')) {
            return 'vendor'
          }
        },
        // Deterministic hashes for long-term caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // CSS code splitting
    cssCodeSplit: false, // Single CSS file is faster for first load
    // Minification
    minify: 'esbuild',
  },
  // Optimize deps — pre-bundle common imports on dev startup
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'lucide-react',
      'axios',
      'qrcode.react',
      'zustand',
    ],
  },
})
