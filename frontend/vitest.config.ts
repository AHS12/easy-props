import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // What's new reads CHANGELOG.md, which lives at the top of the repository.
    server: {fs: {allow: ['..']}},
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/tests/setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
})
