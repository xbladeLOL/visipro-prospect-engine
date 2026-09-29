#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT_DIR"
trap 'printf "\n[ERREUR] Installation interrompue à la ligne %s.\n" "$LINENO" >&2' ERR

green='\033[0;32m'; blue='\033[0;34m'; yellow='\033[1;33m'; reset='\033[0m'
step(){ printf "\n${blue}==> %s${reset}\n" "$1"; }
ok(){ printf "${green}[OK] %s${reset}\n" "$1"; }

if [[ ${EUID} -ne 0 ]]; then
  echo "Lancez ce fichier avec : sudo bash installer.sh"
  exit 1
fi

echo "================================================="
echo " Installation de VisiPro Prospect Engine"
echo "================================================="
echo "Ce programme installe Docker, crée les clés et démarre le moteur."

step "Installation des outils système"
apt-get update -qq
apt-get install -y -qq ca-certificates curl jq openssl >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version >/dev/null
ok "Docker et les outils sont disponibles"

if [[ -f .env ]]; then
  printf "${yellow}Une configuration .env existe déjà.${reset}\n"
  read -r -p "La conserver ? [O/n] " keep_env
  if [[ ${keep_env:-O} =~ ^[Nn]$ ]]; then mv .env ".env.backup.$(date +%Y%m%d%H%M%S)"; else REUSE_ENV=true; fi
fi

if [[ ${REUSE_ENV:-false} != true ]]; then
  step "Configuration sécurisée"
  db_password=$(openssl rand -hex 24)
  api_key=$(openssl rand -hex 32)
  read -r -p "Port HTTP de l'API [8080] : " api_port
  api_port=${api_port:-8080}
  echo "Fournisseur de recherche :"
  echo "  1) DataForSEO (recommandé pour la production)"
  echo "  2) SerpApi"
  echo "  3) Démonstration sans clé"
  read -r -p "Votre choix [3] : " provider_choice
  case ${provider_choice:-3} in
    1) provider=dataforseo; read -r -p "Identifiant DataForSEO : " dfs_login; read -r -s -p "Mot de passe DataForSEO : " dfs_password; echo ;;
    2) provider=serpapi; read -r -s -p "Clé SerpApi : " serp_key; echo ;;
    *) provider=mock ;;
  esac
  read -r -p "Heure UTC de la recherche quotidienne [2] : " schedule_hour
  schedule_hour=${schedule_hour:-2}
  cat > .env <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=${api_port}
LOG_LEVEL=info
POSTGRES_PASSWORD=${db_password}
DATABASE_URL=postgresql://visipro_prospects:${db_password}@postgres:5432/visipro_prospects
API_KEY=${api_key}
ALLOWED_ORIGINS=http://localhost:3000
WORKER_CONCURRENCY=3
DISCOVERY_CONCURRENCY=1
REQUEST_TIMEOUT_MS=15000
MAX_SITE_BYTES=3000000
MAX_PAGES_PER_SITE=5
USER_AGENT=VisiProProspectBot/0.1
DISCOVERY_PROVIDER=${provider}
DATAFORSEO_LOGIN=${dfs_login:-}
DATAFORSEO_PASSWORD=${dfs_password:-}
SERPAPI_KEY=${serp_key:-}
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
SCREENSHOT_ENABLED=false
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium
RETENTION_DAYS=180
SCHEDULER_ENABLED=true
DISCOVERY_SCHEDULE_HOUR_UTC=${schedule_hour}
DISCOVERY_RESULTS_PER_QUERY=30
EOF
  chmod 600 .env
  ok "Clé API et mot de passe PostgreSQL générés automatiquement"
fi

step "Construction de l'application"
docker compose build
ok "Image construite"

step "Démarrage de PostgreSQL et application des migrations"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U visipro_prospects -d visipro_prospects >/dev/null 2>&1; do printf '.'; sleep 2; done
echo
# POSTGRES_PASSWORD n'est appliqué par l'image officielle qu'à la création du
# volume. Sur une réinstallation, synchroniser le rôle existant avec le nouveau
# secret généré évite une erreur d'authentification sans supprimer les données.
db_password_current=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
if [[ ! "$db_password_current" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
  echo "Mot de passe PostgreSQL invalide dans .env."
  exit 1
fi
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U visipro_prospects -d postgres -c "ALTER ROLE visipro_prospects WITH PASSWORD '${db_password_current}';" >/dev/null
ok "Mot de passe PostgreSQL synchronisé"
docker compose run --rm migrate
docker compose run --rm api node dist/cli/seed.js
ok "Base de données initialisée"

step "Démarrage de l'API, des workers et du planificateur"
docker compose up -d api worker scheduler
port=$(sed -n 's/^PORT=//p' .env)
for _ in {1..30}; do curl -fsS "http://127.0.0.1:${port}/ready" >/dev/null && break; sleep 2; done
curl -fsS "http://127.0.0.1:${port}/ready" >/dev/null
ok "Tous les services fonctionnent"

api_key=$(sed -n 's/^API_KEY=//p' .env)
echo
echo "================================================="
echo " Installation terminée"
echo "================================================="
echo "API locale : http://127.0.0.1:${port}"
echo "Fournisseur : $(sed -n 's/^DISCOVERY_PROVIDER=//p' .env)"
echo "Recherche quotidienne : $(sed -n 's/^DISCOVERY_SCHEDULE_HOUR_UTC=//p' .env)h UTC"
echo "Clé API : ${api_key}"
echo
echo "Pour chercher des prospects : sudo bash recherche.sh"
echo "Pour voir les services : docker compose ps"
echo "Pour suivre les journaux : docker compose logs -f --tail=100"
