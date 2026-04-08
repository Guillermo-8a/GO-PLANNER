import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración para que Vite entienda React y Tailwind
export default defineConfig({
  plugins: [react()],
})
