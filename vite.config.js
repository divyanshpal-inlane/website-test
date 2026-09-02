import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc' // Use only SWC version
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mui/styled-engine': '@mui/styled-engine-sc',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
          three: ['@react-three/fiber', '@react-spring/three'],
          animation: ['framer-motion', 'gsap']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})