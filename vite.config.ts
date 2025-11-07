import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ Simplified Vite config for React + TypeScript + Vercel
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.VITE_API_KEY),
  },
})
