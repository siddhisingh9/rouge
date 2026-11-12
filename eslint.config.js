import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Spec §3: `new Date("YYYY-MM-DD")` parses as UTC. Use parseISODate instead.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal']",
          message:
            'Do not parse date strings with new Date(). Use parseISODate from src/engine/dates.ts.',
        },
      ],
    },
  },
  {
    // Spec §0.7: the engine is pure — no React, no Dexie, no clock.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'The engine must not depend on React.',
            },
            { group: ['dexie', 'dexie-*'], message: 'The engine must not depend on Dexie.' },
            {
              group: ['../db/*', '../lib/*', '../screens/*', '../components/*'],
              message: 'The engine must stay pure.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine must not read the clock. Take `today` as a parameter.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'The engine must not read the clock. Take `today` as a parameter.',
        },
        {
          selector:
            "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal']",
          message: 'Do not parse date strings with new Date(). Use parseISODate.',
        },
      ],
    },
  },
  prettier,
]);
