#!/usr/bin/env bash
set -euo pipefail
backup_dir=${1:-./backups}
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U visipro_prospects -d visipro_prospects -Fc > "$backup_dir/visipro_prospects_$stamp.dump"
find "$backup_dir" -type f -name '*.dump' -mtime +14 -delete
