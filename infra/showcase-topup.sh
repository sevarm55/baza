#!/bin/sh
# Витринная мойка не должна пустеть — см. showcase-topup.sql.
#
# Ходим прямо в контейнер базы: задача не зависит ни от DNS, ни от TLS,
# ни от соседнего Caddy, и наружу ничего не выходит.
set -e
docker exec -i bazis-postgres psql -U bazis -d bazis -q < /opt/bazis/infra/showcase-topup.sql
