import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isAnalyze = process.env.ANALYZE === 'true'

// https://vite.dev/config/
export default defineConfig(async () => {
  const plugins = [react()]
  if (isAnalyze) {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(visualizer({
      open: true,
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
    }))
  }

  return {
    plugins,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined

            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }
            if (id.includes('react-simple-wysiwyg') || id.includes('dompurify') || id.includes('isomorphic-dompurify')) {
              return 'vendor-editor'
            }

            return undefined
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:5000',
      },
    },
  }
})
