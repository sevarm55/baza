#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Деплой Базиса. Запускать на сервере из /opt/bazis:
#      ./infra/deploy.sh
#
#  Скрипт намеренно не трогает ничего чужого: собирает свой образ,
#  поднимает свои контейнеры и всё. Настройка Caddy — отдельный
#  разовый шаг, потому что это правка конфига соседа.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -f infra/.env ]; then
  echo "нет infra/.env — создайте его с POSTGRES_PASSWORD и SESSION_SECRET"
  exit 1
fi

# ── Бой не может быть стендом ──
#
# `STAGING=1` выключает отправку SMS и закрывает сайт от поисковиков
# (см. lib/staging.ts). В боевом окружении это катастрофа, причём тихая:
# сайт продолжает работать, а зарегистрироваться не может никто, потому
# что код подтверждения уходит в лог вместо телефона.
#
# Попасть сюда переменная может ровно одним способом — копированием
# `.env` со стенда. Способ обыденный, поэтому проверка стоит здесь, а не
# в списке того, о чём надо помнить.
if grep -qE '^STAGING=' infra/.env; then
  echo "в боевом infra/.env есть STAGING — это настройка тестового стенда."
  echo "с ней бой перестаёт отправлять SMS и уходит из поиска. уберите строку."
  exit 1
fi

echo "→ обновляю код"
git pull --ff-only

echo "→ собираю образ"
docker compose --env-file infra/.env -f infra/docker-compose.yml build

echo "→ поднимаю контейнеры"
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

echo "→ жду, пока приложение ответит"
for i in $(seq 1 30); do
  if docker exec bazis-web node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "готово: приложение отвечает"
    docker compose -f infra/docker-compose.yml ps
    exit 0
  fi
  sleep 2
done

echo "приложение не ответило за минуту — смотрите логи:"
echo "  docker logs --tail 50 bazis-web"
exit 1
