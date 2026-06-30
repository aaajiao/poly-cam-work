import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'poly.cam.work',
        short_name: 'poly.cam',
        description: 'Visualization platform and digital archive for the work of aaajiao.',
        theme_color: '#0f0f11',
        background_color: '#1a1b1e',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['**/models/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('@react-three')) {
            return 'react-three-vendor'
          }

          if (id.includes('three-mesh-bvh')) {
            return 'three-bvh-vendor'
          }

          if (id.includes('/three/examples/jsm/')) {
            return 'three-examples-vendor'
          }

          if (id.includes('/three/')) {
            return 'three-core-vendor'
          }

          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor'
          }

          if (
            id.includes('lucide-react') ||
            id.includes('@radix-ui') ||
            id.includes('/radix-ui/')
          ) {
            return 'ui-vendor'
          }

          if (id.includes('zustand')) {
            return 'state-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  assetsInclude: ['**/*.glb', '**/*.ply'],
  worker: { format: 'es' }
})
