import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
