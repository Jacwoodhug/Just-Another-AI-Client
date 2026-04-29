import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  plugins: [react()],
  build: {
    // Output next to the project root so FastAPI can serve it
    outDir: resolve(__dirname, '../frontend-dist'),
    emptyOutDir: true,
    // Don't bundle index.html – FastAPI serves it from FRONTEND_DIR.
    // We only want the compiled JS/CSS assets.
    lib: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.jsx'),
      output: {
        entryFileNames: 'assets/code-workspace.js',
        assetFileNames: 'assets/[name][extname]',
        format: 'iife',
        name: 'CodeWorkspaceBundle',
      },
    },
    sourcemap: true,
  },
  resolve: {
    extensions: ['.jsx', '.js'],
  },
});
