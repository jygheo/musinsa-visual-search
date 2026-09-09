import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'onnxruntime-web']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['sharp', 'onnxruntime-node']
    }
  },
  worker: {
    format: 'es'
  }
});