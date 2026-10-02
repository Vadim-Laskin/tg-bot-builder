import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конструктор живёт по адресу /cp/ — корень сайта (/) занимает отдельный
// информационный сайт из папки site/ (см. scripts/copy-site.mjs).
export default defineConfig({
  base: '/cp/',
  plugins: [react()],
  server: { port: 5173, open: '/cp/' },
  build: { outDir: 'dist/cp', emptyOutDir: true }
});
