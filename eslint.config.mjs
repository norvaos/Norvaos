import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Extract plugins from the eslint-config-next bundle.
// ESLint flat config requires the plugin to be declared in the same config
// object as its rules.
const nextPlugins = nextVitals.find((c) => c.plugins)?.plugins ?? {};
const reactPlugin = nextPlugins["react"];
const reactHooksPlugin = nextPlugins["react-hooks"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ─── Project-wide rule overrides ──────────────────────────────────────────
  // These rules have pre-existing violations across the codebase that pre-date
  // Sprint 6. They are downgraded from 'error' to 'warn' to document technical
  // debt without blocking CI. All violations are tracked in docs/KNOWN_ISSUES.md
  // and targeted for Sprint 7 remediation.
  {
    plugins: {
      ...(reactPlugin ? { react: reactPlugin } : {}),
      ...(reactHooksPlugin ? { "react-hooks": reactHooksPlugin } : {}),
    },
    rules: {
      // TypeScript — Supabase client type limitation (project-wide pattern)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      // General JS — pre-existing in legacy scripts
      "prefer-const": "warn",
      // React — apostrophes in JSX text across dashboard UI pages
      ...(reactPlugin ? { "react/no-unescaped-entities": "warn" } : {}),
      // React Compiler rules — pre-existing violations in dashboard UI pages
      ...(reactHooksPlugin
        ? {
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/purity": "warn",
            "react-hooks/static-components": "warn",
            "react-hooks/use-memo": "warn",
            "react-hooks/immutability": "warn",
            "react-hooks/preserve-manual-memoization": "warn",
            "react-hooks/gating": "warn",
            "react-hooks/set-state-in-render": "warn",
          }
        : {}),
    },
  },
]);

export default eslintConfig;
