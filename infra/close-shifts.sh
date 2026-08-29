#!/bin/sh
# Вечернее закрытие смен.
#
# Раз в час: у бизнесов разные часовые пояса, и «20:00» у каждого своё —
# чей вечер наступил, решает само приложение.
#
# Ходим изнутри контейнера, а не по публичному адресу: секрет не покидает
# машину, и задача не зависит ни от DNS, ни от TLS, ни от соседнего Caddy.
set -eu
docker exec bazis-web node -e "
fetch('http://127.0.0.1:3000/api/v1/cron/close-shifts', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
}).then(r => r.text()).then(t => console.log(t))
  .catch(e => { console.error(e.message); process.exit(1); });
"
