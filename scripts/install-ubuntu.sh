#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run with sudo: sudo ./scripts/install-ubuntu.sh"; exit 1; fi
command -v docker >/dev/null || { apt-get update; apt-get install -y ca-certificates curl; curl -fsSL https://get.docker.com | sh; }
systemctl enable --now docker
if [[ ! -f .env ]]; then cp .env.example .env; sed -i "s/change_me/$(openssl rand -hex 24)/" .env; sed -i "s/change-with-openssl-rand-hex-32/$(openssl rand -hex 32)/" .env; fi
docker compose build
docker compose up -d
docker compose run --rm migrate
docker compose run --rm api node dist/cli/seed.js
echo "VisiPro Prospect Engine is available on port ${PORT:-8080}."
