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
echo "Saisissez un ou plusieurs secteurs séparés par des virgules, ou 'tous'."
read -r -p "Secteurs (ex. électricien,paysagiste) : " query_input
read -r -p "Ville (ex. Orléans) : " city
read -r -p "Nombre maximum de résultats par secteur [30] : " limit; limit=${limit:-30}
read -r -p "Exiger une adresse email ? [O/n] : " email_answer; email_answer=${email_answer:-O}
[[ -n "$query_input" && -n "$city" ]] || { echo "Au moins un secteur et la ville sont obligatoires."; exit 1; }
require_email=false; [[ $email_answer =~ ^[OoYy] ]] && require_email=true
if [[ ${query_input,,} == "tous" ]]; then
  options=$(curl -fsS "${headers[@]}" "$api/v1/search-options")
  queries=$(jq -c '[.categories[].query_terms[0]] | unique' <<<"$options")
else
  queries=$(jq -nc --arg value "$query_input" '$value | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)) | unique')
fi
query_count=$(jq 'length' <<<"$queries"); [[ $query_count -gt 0 ]] || { echo "Aucun secteur valide."; exit 1; }

before=$(curl -fsS "${headers[@]}" "$api/v1/stats")
echo "[1/4] Envoi de $query_count recherche(s) à $city"
payload=$(jq -nc --argjson queries "$queries" --arg city "$city" --argjson limit "$limit" --argjson requireEmail "$require_email" '{queries:$queries,city:$city,limit:$limit,requireEmail:$requireEmail}')
response=$(curl -fsS -X POST "${headers[@]}" -H 'content-type: application/json' -d "$payload" "$api/v1/discovery-runs")
job_ids=$(jq -r '.jobIds[]' <<<"$response")
echo "      Tâches créées : $(jq -r '.queued' <<<"$response")"

echo "[2/4] Recherche des entreprises..."
while true; do
  completed=0; failed=0
  while IFS= read -r job_id; do
    job=$(curl -fsS "${headers[@]}" "$api/v1/jobs/$job_id"); status=$(jq -r '.status' <<<"$job")
    [[ $status == COMPLETED ]] && completed=$((completed+1))
    [[ $status == FAILED || $status == CANCELLED ]] && failed=$((failed+1))
  done <<<"$job_ids"
  printf "\r      Recherches terminées : %-3s / %-3s échecs : %-3s" "$completed" "$query_count" "$failed"
  [[ $((completed+failed)) -eq $query_count ]] && break
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
email_filter=(); [[ $require_email == true ]] && email_filter=(--data 'hasEmail=true')
items=$(curl -fsS "${headers[@]}" --get --data-urlencode "city=$city" "${email_filter[@]}" --data 'limit=100' "$api/v1/businesses")
new_total=$(( $(jq -r '.total' <<<"$after") - $(jq -r '.total' <<<"$before") ))
echo "---------------------------------------------"
echo "Nouvelles entreprises : $new_total"
echo "Prospects à vérifier  : $(jq -r '.review' <<<"$after")"
echo "Erreurs de tâches     : $(jq -r '.failed' <<<"$summary")"
echo
printf '%-5s %-14s %-32s %-36s %s\n' SCORE NIVEAU ENTREPRISE EMAIL OFFRES
jq -r '.items[] | [.total,.tier,.name,(.email // "-"),((.recommended_offers // [])|join(", "))] | @tsv' <<<"$items" | while IFS=$'\t' read -r score tier name email offers; do printf '%-5s %-14s %-32.32s %-36.36s %s\n' "$score" "$tier" "$name" "$email" "$offers"; done
echo "---------------------------------------------"
echo "Recherche terminée. Les résultats restent en validation humaine."
