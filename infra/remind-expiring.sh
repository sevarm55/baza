#!/bin/sh
# Напоминание владельцу платформы: у кого завтра кончается доступ.
#
# Раз в сутки, а не раз в час: письмо про завтрашний день, и второе такое
# же через час — не забота, а повод выключить уведомления.
#
# Ходим изнутри контейнера, а не по публичному адресу: секрет не покидает
# машину, и задача не зависит ни от DNS, ни от TLS, ни от соседнего Caddy.
set -eu
docker exec bazis-web node -e "
fetch('http://127.0.0.1:3000/api/v1/cron/remind-expiring', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
}).then(r => r.text()).then(t => console.log(t))
  .catch(e => { console.error(e.message); process.exit(1); });
"
