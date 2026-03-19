import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "dist/**",
      "index.js",
      "besu-test-network/**",
      "files/**"
    ]
  },
  eslint.configs.recommended,
  jsdoc.configs['flat/recommended'],
  
  // 1. Base TypeScript rules (syntax only, no type-checking)
  ...tseslint.configs.recommended,

  // 2. Strict Type-Checked rules ONLY for .ts files
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 3. Global Rules & Overrides
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "semi": ["error", "always"],
      "camelcase": "error",
      "eqeqeq": ["error", "smart"],
      "max-len": ["error", { "code": 240, "ignoreStrings": true, "ignoreTemplateLiterals": true }],
      "no-shadow": "error",
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
      "no-console": "off",

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-require-imports": "warn",

      "jsdoc/require-param-description": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/tag-lines": ["error", "any", { "startLines": 1 }],
    },
  },

  // 4. Explicitly disable type checking for JS files (just to be safe)
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
        // Turn off the "require" warning specifically for JS scripts
        "@typescript-eslint/no-require-imports": "off",
    }
  }
);