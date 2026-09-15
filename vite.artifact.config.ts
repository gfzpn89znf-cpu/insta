import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Baut die App in eine einzige JavaScript-Datei.
 *
 * Die Vorschau-Fassung (Artifact) muss ohne nachzuladende Dateien starten -
 * deshalb wird hier auch der dynamisch geladene Teil (das KI-SDK) mit
 * eingebettet, statt ihn abzuspalten.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-artifact',
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
