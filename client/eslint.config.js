import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.firebase']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        args: 'none',
        caughtErrors: 'none',
        destructuredArrayIgnorePattern: '^_',
      }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/pages/**/components/**',
                '**/pages/**/hooks/**',
                '**/pages/**/utils/**',
                '**/pages/**/constants.js',
              ],
              message:
                'Do not deep-import another page module internals. Import page entries (index.js) or shared layers.',
            },
          ],
        },
      ],
    },
  },
])
