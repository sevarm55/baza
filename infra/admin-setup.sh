#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Вход в админку на сервере: логин и пароль владельца платформы.
#  Запускать на своей машине из корня репозитория:
#      bash infra/admin-setup.sh                   # бой, сервер contabo
#      bash infra/admin-setup.sh --test            # тестовый стенд
#      bash infra/admin-setup.sh other-host        # другой хост из ~/.ssh/config
#      bash infra/admin-setup.sh --test other-host # то и другое
#
#  Скрипт спрашивает логин и пароль, считает хеш здесь же, кладёт на
#  сервер только логин и хеш и перезапускает приложение. Сам пароль не
#  печатается, не уходит в историю команд и на сервере не хранится.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# Умолчание — бой, и это правильное умолчание: команда без флага делает
# то же, что делала всегда. Стенд просят явно, потому что перепутать
# направление здесь стоит дорого — пароль от админки боевой платформы
# оказался бы установлен «заодно», при попытке настроить тест.
TARGET=prod
if [ "${1:-}" = "--test" ]; then
  TARGET=test
  shift
fi

HOST="${1:-contabo}"

if [ "$TARGET" = test ]; then
  DIR=/opt/bazis-test
  ENV_FILE=infra/.env.test
  DEPLOY='bash infra/deploy-test.sh'
  URL=https://test.tetrin.pro
else
  DIR=/opt/bazis
  ENV_FILE=infra/.env
  DEPLOY='bash infra/deploy.sh'
  URL=https://tetrin.pro
fi

cd "$(dirname "$0")/.."

read -r -p 'Логин для админки: ' LOGIN
[ -n "$LOGIN" ] || { echo 'Логин пустой.'; exit 1; }

read -r -s -p 'Пароль (не короче 8 знаков): ' PASS; echo
read -r -s -p 'Повторите пароль: ' PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo 'Пароли не совпали.'; exit 1; }
[ "${#PASS}" -ge 8 ] || { echo 'Пароль короче восьми знаков.'; exit 1; }

echo '→ считаю хеш'
# Тот же scrypt, что у PIN-кодов продукта; открытый пароль никуда не едет.
HASH="$(npx tsx scripts/admin-password.ts "$PASS" | sed "s/^ADMIN_PASSWORD_HASH='//; s/'\$//")"
[ -n "$HASH" ] || { echo 'Не удалось посчитать хеш.'; exit 1; }

# Доллары удваиваются намеренно: docker compose разворачивает `$NAME` в
# значениях `--env-file`, и хеш вида `s2$16384$8$1$…` доехал бы до
# контейнера с выеденными кусками. При чтении файла compose вернёт `$$`
# обратно в один доллар — проверено на сервере.
ESCAPED="$(printf '%s' "$HASH" | sed 's/\$/$$/g')"

echo "→ кладу логин и хеш в $HOST:$DIR/$ENV_FILE"
printf 'ADMIN_LOGIN=%s\nADMIN_PASSWORD_HASH=%s\n' "$LOGIN" "$ESCAPED" |
  ssh "$HOST" "cd $DIR \
    && cp $ENV_FILE $ENV_FILE.bak \
    && sed -i '/^ADMIN_LOGIN=/d;/^ADMIN_PASSWORD=/d;/^ADMIN_PASSWORD_HASH=/d' $ENV_FILE \
    && cat >> $ENV_FILE \
    && chmod 600 $ENV_FILE \
    && $DEPLOY"

echo
echo "готово: $URL/admin/login, логин $LOGIN"
echo "прежний файл окружения остался рядом как $ENV_FILE.bak"
