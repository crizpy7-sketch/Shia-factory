// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'fixtures/**', 'public/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      // The runtime handles untyped data from models and HTTP; `unknown` plus validation is the
      // pattern, and an explicit `any` is a defect rather than a style choice.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Tests may log and may reach into structures the production code keeps closed.
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
