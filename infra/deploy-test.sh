#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Деплой тестового стенда. Запускать на сервере из /opt/bazis-test:
#      bash infra/deploy-test.sh          # ветка test
#      bash infra/deploy-test.sh <ветка>  # любая другая
#
#  Боевой /opt/bazis этот скрипт не трогает никогда: у стенда свой
#  каталог, своя ветка, свой compose, свой образ и своя база.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${1:-test}"
ENV_FILE=infra/.env.test
COMPOSE="docker compose --env-file $ENV_FILE -f infra/docker-compose.test.yml"

# ── Проверка каталога ──
#
# Единственная ошибка, которая здесь по-настоящему дорого стоит: запустить
# стенд в боевом каталоге. Тогда `git checkout test` увёл бы с main тот
# самый рабочий каталог, из которого выкатывается прод, и следующий
# боевой деплой собрал бы образ из тестовой ветки.
#
# Признак боевого каталога — его собственный `infra/.env`, которого у
# стенда нет и быть не должно.
if [ -f infra/.env ] && [ ! -f "$ENV_FILE" ]; then
  echo "здесь лежит боевой infra/.env, а тестового $ENV_FILE нет."
  echo "похоже, это /opt/bazis — боевой каталог. стенд живёт в /opt/bazis-test."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "нет $ENV_FILE — создайте его с POSTGRES_PASSWORD и SESSION_SECRET"
  echo "секреты берите НОВЫЕ, не боевые: см. README, раздел «Тестовый стенд»"
  exit 1
fi

# ── Проверка секрета ──
#
# Общий с боем SESSION_SECRET означал бы, что cookie, выписанная стендом,
# открывает кабинет на tetrin.pro. Проверяем, только если боевой файл
# рядом и читается: на чужой машине его нет, и это не повод не работать.
PROD_ENV=/opt/bazis/infra/.env
if [ -r "$PROD_ENV" ]; then
  test_secret=$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  prod_secret=$(grep -E '^SESSION_SECRET=' "$PROD_ENV" | head -1 | cut -d= -f2-)
  if [ -n "$test_secret" ] && [ "$test_secret" = "$prod_secret" ]; then
    echo "SESSION_SECRET стенда совпадает с боевым."
    echo "это значит, что сессия со стенда принимается боем. поставьте другой:"
    echo "  openssl rand -hex 32"
    exit 1
  fi
fi

echo "→ обновляю код: ветка $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
# reset, а не pull: стенд ничего своего не хранит и обязан быть точной
# копией ветки. Расхождение здесь означало бы, что проверили одно, а в
# main поедет другое.

echo "→ собираю образ"
$COMPOSE build

echo "→ поднимаю контейнеры"
$COMPOSE up -d

echo "→ жду, пока стенд ответит"
for i in $(seq 1 30); do
  if docker exec bazis-test-web node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "готово: https://test.tetrin.pro"
    echo
    echo "код подтверждения при входе:"
    echo "  docker logs -f bazis-test-web | grep 'sms:dev'"
    $COMPOSE ps
    exit 0
  fi
  sleep 2
done

echo "стенд не ответил за минуту — смотрите логи:"
echo "  docker logs --tail 50 bazis-test-web"
exit 1
