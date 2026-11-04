import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetOutDir = process.env.AEROKIN_OUT_DIR
  ? path.resolve(__dirname, process.env.AEROKIN_OUT_DIR)
  : path.resolve(__dirname, '../server/public');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../design-system/src'),
    },
  },
  build: {
    outDir: targetOutDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-radix': [
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            'vaul',
          ],
          'vendor-motion': ['motion'],
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
