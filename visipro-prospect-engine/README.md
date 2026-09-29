# VisiPro Prospect Engine

Service autonome de découverte et de qualification de prospects locaux. Ce dépôt ne contient et ne modifie aucun code du dashboard VisiPro. L'intégration se fera plus tard via l'API HTTP authentifiée.

## Fonctions disponibles

- découverte via DataForSEO, SerpApi ou fournisseur de démonstration ;
- déduplication par identifiant source, domaine et téléphone ;
- analyse bornée du site (SEO, conversion, contact, mobile, fraîcheur, technologies) ;
- score VisiPro explicable sur 100 et recommandations d'offres ;
- validation humaine (`REVIEW`, `APPROVED`, `REJECTED`, `DO_NOT_CONTACT`) ;
- file de tâches fiable dans PostgreSQL, reprises automatiques et backoff ;
- planificateur quotidien des couples zones/métiers actifs ;
- API avec clé, validation, CORS et limitation de débit ;
- conteneurs non privilégiés avec limites CPU/RAM adaptées à un i5-10400F et 16 Go.

## Démarrage Ubuntu recommandé

```bash
sudo bash installer.sh
```

L'installateur pose les questions nécessaires, génère automatiquement le mot de passe PostgreSQL et la clé API, construit les conteneurs, initialise la base et vérifie tous les services.

Une fois installé, lancez une recherche interactive avec :

```bash
sudo bash recherche.sh
```

Le script affiche en direct la découverte, les analyses en attente ou en cours, puis un tableau récapitulatif avec score, niveau et offres recommandées.

Installation manuelle alternative :

```bash
docker compose build
docker compose up -d
docker compose run --rm api node dist/cli/seed.js
curl http://localhost:8080/health
```

Lancer une découverte :

```bash
curl -X POST http://localhost:8080/v1/discovery-runs \
  -H "x-api-key: VOTRE_CLE" -H "content-type: application/json" \
  -d '{"query":"électricien","city":"Orléans","limit":30}'
```

Consulter les candidats :

```bash
curl 'http://localhost:8080/v1/businesses?minScore=70' -H "x-api-key: VOTRE_CLE"
```

Le fournisseur `mock` est activé par défaut pour tester sans coût. Pour la production, définir `DISCOVERY_PROVIDER=dataforseo` et ses identifiants. SerpApi est également supporté.

Après le seed, le planificateur lance chaque jour les recherches configurées à `DISCOVERY_SCHEDULE_HOUR_UTC`. Un lancement immédiat complet est possible avec `POST /v1/discovery-runs/plan`.

## Sécurité et conformité

Le moteur n'envoie aucun message automatiquement. Les prospects doivent être validés manuellement. Le statut `DO_NOT_CONTACT` et la table `suppression_list` permettent de conserver les oppositions. Configurez un vrai domaine dans `USER_AGENT`, exposez l'API derrière HTTPS et ne publiez jamais `.env`.

## Ressources serveur

Les valeurs par défaut utilisent trois analyses simultanées. Avec 16 Go de RAM, conserver `WORKER_CONCURRENCY=3` au départ. PostgreSQL est limité à 2 Go, l'API à 2 Go et le worker à 5 Go. Les requêtes web sont limitées à 15 secondes et 3 Mo.

## Développement

```bash
npm ci
copy .env.example .env
npm run check
```

## Livraison propre

Sous Windows :

```powershell
.\scripts\make-clean-release.ps1
```

Le dossier `release/visipro-prospect-engine` contient uniquement les sources et fichiers nécessaires au déploiement, sans dépendances, données, secrets ni artefacts de test.

## Future intégration au dashboard

Le dashboard pourra consommer `GET /v1/businesses`, `GET /v1/stats`, valider un candidat avec `PATCH /v1/businesses/:id/status`, puis copier un prospect approuvé dans son propre modèle `Prospect`. Aucun couplage de base de données n'est requis.
