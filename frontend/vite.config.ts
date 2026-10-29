import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        // The Three.js chunk is inherently large. Split it out and raise the
        // warning threshold so real regressions still stand out.
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                // Three.js is large and changes rarely. Keeping it in its own
                // chunk keeps the app chunk small and cacheable.
                manualChunks: {
                    three: ['three'],
                },
            },
        },
    },
})
