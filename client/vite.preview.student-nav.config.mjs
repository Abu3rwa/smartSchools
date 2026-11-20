import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: [{ find: /^(?:.*\/)?config\/api(?:\.js)?$/, replacement: fileURLToPath(new URL('./__preview_student_nav__/apiStub.js', import.meta.url)) }] },
  server: { port: 5199, strictPort: true }
});
