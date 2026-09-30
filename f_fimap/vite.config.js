import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(),cesium()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
