// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    // Persistence stays behind repository interfaces; only src/database may
    // touch TypeORM. (test/ is not covered and may use it for fixtures.)
    files: ['src/**/*.ts'],
    // app.module.ts is the composition root that picks the persistence module.
    ignores: ['src/database/**', 'src/app.module.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'typeorm',
              message:
                'Use a repository interface; TypeORM lives in src/database/typeorm.',
            },
            {
              name: '@nestjs/typeorm',
              message:
                'Use a repository interface; TypeORM lives in src/database/typeorm.',
            },
          ],
          patterns: [
            {
              group: ['**/typeorm/**'],
              message:
                'Use a repository interface; TypeORM lives in src/database/typeorm.',
            },
          ],
        },
      ],
    },
  },
);
