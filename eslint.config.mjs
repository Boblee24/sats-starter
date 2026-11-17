import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Logging goes through @sats/core/log only (rule 3 in CLAUDE.md).
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["scripts/**/*.ts"], rules: { "no-console": "off" } },
);
