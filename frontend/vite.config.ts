import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit({
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html' }),
    csp: { mode: 'hash' }
  })],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false }
    }
  }
});
