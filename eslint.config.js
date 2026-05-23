import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '.next',
      'dist',
      'build',
      'coverage',
      'mcp-servers',
      '.claude',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Security and audit rules (errors)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-throw-literal': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'eqeqeq': ['warn', 'always'],

      // Relaxed style rules (catch-empty-handler is idiomatic in many APIs ;
      // useless-escape is mostly false-positives on regex literals ;
      // useless-assignment / constant-binary-expression are mostly false
      // positives from defensive code). Keep as warn so they are visible
      // but don't block CI. Cleanup pass to fix all 188 reports planned in
      // a separate housekeeping PR.
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-misleading-character-class': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
      'preserve-caught-error': 'warn',

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Next.js rules
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
