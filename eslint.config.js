import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

// Carried over from the monorepo this package was extracted from, minus everything that
// applied to apps rather than to a library — no Astro, no React, no per-app overrides.
// The rules that shaped the source are all still here, so the code lints the same way it
// did before the split.

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-nested-ternary': 'error',
    },
  },
  {
    // Type-aware rules. `projectService` reads tsconfig.json; `allowDefaultProject` covers
    // tsup.config.ts, which is deliberately outside the tsconfig `include` — a file cannot
    // belong to both without typescript-eslint erroring.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'warn',
    },
  },
  {
    // Scripts run in Node. Globals are listed by hand rather than pulled from `globals`, so
    // anything a script reaches for that is not here surfaces as an error instead of being
    // silently assumed available.
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The examples are CLIs; stdout and stderr are their interface.
    files: ['examples/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
