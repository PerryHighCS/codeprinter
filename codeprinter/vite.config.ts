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
                        req.url = req.url.replace(/^\/ppr(\?|\/)?/, '/ppr/index.html$1');
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
});
