import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import parser from '@typescript-eslint/parser';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  js.configs.recommended,
  ...tseslint.config({
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: process.cwd(),
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.browser,
    },
  }),  
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
      }],
    },
  },
  {
    files: ['eslint.config.js', 'eslint.config.mjs', 'tailwind.config.js', 'vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/ppr/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.node,
    },
  },
  {
    ignores: ['**/dist', '**/dist-types', '**/.eslintrc.cjs'],
  },
];
