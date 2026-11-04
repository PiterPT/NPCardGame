import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'API_'], // Permite que o Vite leia variáveis que comecem por VITE_ ou API_
});