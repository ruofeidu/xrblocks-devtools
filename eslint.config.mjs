// @ts-check

import eslint from '@eslint/js';
import tsdoceslint from 'eslint-plugin-tsdoc';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['src/session/injected/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {tsdoc: tsdoceslint},
    files: ['**/*.ts'],
    rules: {
      'tsdoc/syntax': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['examples/**/*.js'],
    languageOptions: {globals: {...globals.browser}},
  },
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {globals: {...globals.node}},
  }
);
