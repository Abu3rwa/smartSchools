import js from '@eslint/js';
import globals from 'globals';

/** ESLint config for server (Node.js) code. Run: npm run lint */
export default [
  { ignores: ['client/**', 'node_modules/**', 'scripts/**', '**/node_modules/**'] },
  js.configs.recommended,
  {
    files: [
      '*.js',
      'config/**/*.js',
      'controllers/**/*.js',
      'middleware/**/*.js',
      'models/**/*.js',
      'routes/**/*.js',
      'services/**/*.js',
      'utils/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'warn',
    },
  },
];
