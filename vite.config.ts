import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Im Entwicklungsbetrieb spritzt Vite kleine Skripte direkt in die Seite.
 * Die ausgelieferte App tut das nicht - dort bleibt die strenge Regel
 * "script-src 'self'" stehen.
 */
const relaxCspForDev = {
  name: 'fotogram-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml(html: string) {
    return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
  },
};

export default defineConfig({
  plugins: [react(), relaxCspForDev],
  base: './',
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
});
