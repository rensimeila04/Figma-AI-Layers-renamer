import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// We need to build two things:
// 1. The UI code (HTML/JS/CSS) -> bundled into a single index.html
// 2. The main thread code (code.ts) -> bundled into a single code.js

export default defineConfig(({ mode }) => {
    return {
        plugins: [viteSingleFile()],
        build: {
            outDir: 'dist',
            emptyOutDir: false, // Don't delete code.js when building UI
            target: 'esnext',
            assetsInlineLimit: 100000000,
            chunkSizeWarningLimit: 100000000,
            cssCodeSplit: false,
            brotliSize: false,
            rollupOptions: {
                input: {
                    main: './src/index.html',
                },
                output: {
                    entryFileNames: '[name].js',
                },
            },
            minify: false, // Easier debugging
        },
    };
});
