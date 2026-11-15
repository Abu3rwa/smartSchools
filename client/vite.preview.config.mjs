/* TEMPORARY: vite dev config for the dashboard render harness. Deleted after verification. */
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^(?:.*\/)?config\/api(?:\.js)?$/, replacement: path.resolve(__dirname, '__preview__/apiStub.js') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
})