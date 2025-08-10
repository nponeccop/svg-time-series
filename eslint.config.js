// @ts-check

import eslint from "@eslint/js";
import tsEslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import vitest from "@vitest/eslint-plugin";

export default tsEslint.config(
  eslint.configs.recommended,
  ...tsEslint.configs.recommendedTypeChecked,
  ...tsEslint.configs.strictTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-useless-constructor": "error",
      "prefer-const": "error",
      "prefer-spread": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    ...vitest.configs.recommended,
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./segment-tree-rmq/tsconfig.json",
          "./svg-time-series/tsconfig.eslint.json",
          "./samples/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
