# SH-5 — Image de la Gateway (nginx, point d'entrée unique).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# SH-49 — Sonde locale ciblant explicitement 127.0.0.1, et NON `localhost`.
#
# `wget` (BusyBox/Alpine) résout `localhost` en IPv6 `::1` en priorité, alors que ce
# `nginx.conf` ne déclare que `listen 80;` — donc IPv4 uniquement. Le conteneur servait
# parfaitement le trafic tout en étant marqué `unhealthy` en production depuis le
# 2026-07-23 (anomalie AN-01). Fiche : docs/anomalies/AN-01-healthcheck-ipv6.md
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:80/ || exit 1
