import {mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import {pxToRem} from './src/core/settings/px-to-rem'

/** Lets draw-previews.html save what it draws. Exists only on the dev server. */
function savePresetPictures(): Plugin {
    return {
        name: 'save-preset-pictures',
        apply: 'serve',
        // The tool imports this list, so reloading on it would start the drawing all over again.
        handleHotUpdate({file}) {
            return file.endsWith('preset-thumbs.json') ? [] : undefined
        },
        configureServer(server) {
            server.middlewares.use('/__preset-thumbs/', (request, response, next) => {
                const name = request.url?.slice(1) ?? ''

                if (request.method !== 'POST' || !/^[a-z0-9-]+$/.test(name)) {
                    next()
                    return
                }

                const chunks: Buffer[] = []

                request.on('data', (chunk: Buffer) => chunks.push(chunk))
                request.on('end', () => {
                    const folder = resolve(__dirname, 'public/preset-thumbs')

                    mkdirSync(folder, {recursive: true})
                    writeFileSync(
                        name === 'manifest' ? resolve(__dirname, 'src/panels/preset-thumbs.json') : resolve(folder, `${name}.png`),
                        Buffer.concat(chunks),
                    )
                    response.end('saved')
                })
            })
        },
    }
}

/**
 * Pictures of saved props are served by Go, which answers them before Vite is
 * asked. In a plain browser there is no Go, and Vite would answer every unknown
 * address with the app's page, so this says plainly that it has no such file.
 */
function leavePropPicturesToGo(): Plugin {
    return {
        name: 'leave-prop-pictures-to-go',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/your-props/', (_request, response) => {
                response.statusCode = 404
                response.end()
            })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tailwind(), savePresetPictures(), leavePropPicturesToGo()],
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
