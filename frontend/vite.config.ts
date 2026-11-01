import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import {pxToRem} from './src/core/settings/px-to-rem'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tailwind()],
    css: {
        postcss: {
            plugins: [
                {
                    postcssPlugin: 'px-to-rem',
                    Declaration(declaration) {
                        const value = pxToRem(declaration.value)

                        if (value !== declaration.value) {
                            declaration.value = value
                        }
                    },
                },
            ],
        },
    },
    // What's new reads CHANGELOG.md, which lives at the top of the repository.
    server: {fs: {allow: ['..']}},
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
                    ui: ['@heroui/react', 'react-aria-components', 'lucide-react'],
                },
            },
        },
    },
})
