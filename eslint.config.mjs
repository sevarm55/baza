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

    /* Рабочие копии агентов. Это тот же репозиторий, выложенный ещё раз
       под другой веткой: линтер пробегал бы один и тот же код по разу
       на копию, а на ветке, где файла нет, падал бы с ENOENT. */
    ".claude/worktrees/**",
  ]),

  /* Подчёркивание перед именем — общепринятая пометка «параметр здесь
     обязан быть по форме, но не нужен по смыслу». Такое встречается в
     словарях: `carsWord(n)` в русском выбирает «машина / машины /
     машин», а в армянском число ничего не меняет, но подпись функции
     обязана совпадать. */
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

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
