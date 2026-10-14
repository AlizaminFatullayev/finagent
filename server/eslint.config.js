import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Generated and build output is not ours to lint.
  { ignores: ['dist/', 'coverage/', 'src/generated/', 'storage/', '.agents/', '.claude/', '.windsurf/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Prettier owns formatting; disable stylistic rules that would fight it.
  prettier,
  {
    rules: {
      // Leading underscore marks intentionally unused args (e.g. Express error handler signature).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
