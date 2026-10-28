import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**', '.local/**', 'storage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    files: ['scripts/**', 'prisma/seed.ts', 'prisma/seed-people.ts', 'src/cli/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
)
