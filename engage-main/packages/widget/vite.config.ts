import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/apps/backend/**', '**/prisma/**', '**/*.db*', '**/dist/**', '**/*.log']
    }
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Indiquer',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    outDir: resolve(__dirname, '../../apps/backend/public'),
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
