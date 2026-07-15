import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Ensure index.html %VITE_BUILD_*% placeholders always resolve, even on local
// builds where CI env vars aren't set. Vite reads process.env when expanding
// %NAME% in HTML, so we set empty defaults if absent.
process.env.VITE_BUILD_SHA = process.env.VITE_BUILD_SHA || '';
process.env.VITE_BUILD_AT = process.env.VITE_BUILD_AT || '';
process.env.VITE_BUILD_REPO_URL = process.env.VITE_BUILD_REPO_URL || '';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        chunkSurfer: resolve(import.meta.dirname, 'labs/chunk-surfer/index.html')
      }
    }
  }
});
