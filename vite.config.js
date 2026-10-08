import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc' // Use only SWC version
import path from 'path'

// GitHub Pages deploys to /<repo-name>/, so set base accordingly
// Only use GitHub Pages base when explicitly building for GitHub Pages (VITE_GITHUB_PAGES='true')
// This env var is only set in GitHub Actions workflow, not in local dev
const base = process.env.VITE_GITHUB_PAGES === 'true' ? '/website-test/' : '/';

export default defineConfig({
  plugins: [react()],
  base,
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