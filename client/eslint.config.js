import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
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
