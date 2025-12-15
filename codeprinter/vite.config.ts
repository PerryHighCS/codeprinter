import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcssVite from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        tailwindcssVite(),
        react(),
        {
            name: 'serve-ppr',
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    if (req.url?.startsWith('/ppr?') || req.url === '/ppr' || req.url === '/ppr/') {
                        req.url = req.url.replace(/^\/ppr(\?|\/)?/, '/src/ppr/index.html$1');
                    }
                    next();
                });
            },
        },
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    base: './',
    publicDir: 'public',
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                ppr: path.resolve(__dirname, 'src/ppr/index.html'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                dir: 'dist',
            },
        },
    },
});
