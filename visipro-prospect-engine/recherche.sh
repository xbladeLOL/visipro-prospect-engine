#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd); cd "$ROOT_DIR"
[[ -f .env ]] || { echo "Configuration absente. Lancez d'abord : sudo bash installer.sh"; exit 1; }
command -v jq >/dev/null || { echo "jq est absent. Relancez installer.sh."; exit 1; }
port=$(sed -n 's/^PORT=//p' .env); port=${port:-8080}
api_key=$(sed -n 's/^API_KEY=//p' .env)
api="http://127.0.0.1:${port}"
headers=(-H "x-api-key: ${api_key}")
curl -fsS "$api/ready" >/dev/null || { echo "L'application n'est pas prête. Lancez : docker compose up -d"; exit 1; }

echo "============================================="
echo " Recherche de prospects VisiPro"
echo "============================================="
read -r -p "Métier (ex. électricien) : " query
read -r -p "Ville (ex. Orléans) : " city
read -r -p "Nombre maximum de résultats [30] : " limit; limit=${limit:-30}
[[ -n "$query" && -n "$city" ]] || { echo "Le métier et la ville sont obligatoires."; exit 1; }

before=$(curl -fsS "${headers[@]}" "$api/v1/stats")
echo "[1/4] Envoi de la recherche : $query à $city"
payload=$(jq -nc --arg query "$query" --arg city "$city" --argjson limit "$limit" '{query:$query,city:$city,limit:$limit}')
response=$(curl -fsS -X POST "${headers[@]}" -H 'content-type: application/json' -d "$payload" "$api/v1/discovery-runs")
job_id=$(jq -r '.jobId' <<<"$response")
echo "      Tâche créée : $job_id"

echo "[2/4] Recherche des entreprises..."
while true; do
  job=$(curl -fsS "${headers[@]}" "$api/v1/jobs/$job_id")
  status=$(jq -r '.status' <<<"$job")
  printf "\r      Statut : %-12s tentative : %s" "$status" "$(jq -r '.attempts' <<<"$job")"
  [[ $status == COMPLETED ]] && break
  if [[ $status == FAILED || $status == CANCELLED ]]; then echo; echo "Échec : $(jq -r '.last_error' <<<"$job")"; exit 1; fi
  sleep 2
done
echo

echo "[3/4] Analyse des sites et calcul des scores..."
while true; do
  summary=$(curl -fsS "${headers[@]}" "$api/v1/jobs-summary")
  pending=$(jq -r '.pending' <<<"$summary"); running=$(jq -r '.running' <<<"$summary")
  printf "\r      En attente : %-4s en cours : %-4s analyses actives : %-4s" "$pending" "$running" "$(jq -r '.analyzing' <<<"$summary")"
  [[ $pending -eq 0 && $running -eq 0 ]] && break
  sleep 2
done
echo

echo "[4/4] Résumé"
after=$(curl -fsS "${headers[@]}" "$api/v1/stats")
items=$(curl -fsS "${headers[@]}" --get --data-urlencode "city=$city" --data 'limit=100' "$api/v1/businesses")
new_total=$(( $(jq -r '.total' <<<"$after") - $(jq -r '.total' <<<"$before") ))
echo "---------------------------------------------"
echo "Nouvelles entreprises : $new_total"
echo "Prospects à vérifier  : $(jq -r '.review' <<<"$after")"
echo "Erreurs de tâches     : $(jq -r '.failed' <<<"$summary")"
echo
printf '%-5s %-14s %-35s %s\n' SCORE NIVEAU ENTREPRISE OFFRES
jq -r '.items[] | [.total,.tier,.name,((.recommended_offers // [])|join(", "))] | @tsv' <<<"$items" | while IFS=$'\t' read -r score tier name offers; do printf '%-5s %-14s %-35.35s %s\n' "$score" "$tier" "$name" "$offers"; done
echo "---------------------------------------------"
echo "Recherche terminée. Les résultats restent en validation humaine."
