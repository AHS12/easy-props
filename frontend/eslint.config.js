import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['dist', 'node_modules'],
    },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.browser,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-refresh/only-export-components': ['warn', {allowConstantExport: true}],
        },
    },
    {
        files: ['*.config.ts', 'src/tests/setup.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        // The geometry layer must stay free of UI and desktop dependencies so
        // it can be tested and reused in another runtime.
        files: ['src/assets/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    {
                        group: ['react', 'react-dom', 'zustand'],
                        message: 'Geometry modules must stay UI-free.',
                    },
                    {
                        group: ['@wailsio/*', '**/platform/*'],
                        message: 'Geometry modules must not depend on the desktop shell.',
                    },
                ],
            }],
        },
    },
)
