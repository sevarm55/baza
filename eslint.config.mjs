import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

  /* Скрипты проверок читают чужой JSON — ответы своих же ручек, у каждой
     свой набор полей. Описывать их типами значило бы завести второй,
     ручной слепок API рядом с настоящим: он разойдётся с ним при первой
     же правке и начнёт врать. В самом продукте `any` по-прежнему
     запрещён — там типы приходят из схемы и из Drizzle. */
  {
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
