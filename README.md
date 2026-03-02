# 🍐 JellyTulli

Dashboard analytique avancé pour Jellyfin  
Jellyfin + Tautulli = JellyTulli

[![Docker Build](https://github.com/maelmoreau21/JellyTulli/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/maelmoreau21/JellyTulli/actions/workflows/docker-publish.yml)
[![GHCR Image](https://img.shields.io/badge/GHCR-ghcr.io%2Fmaelmoreau21%2Fjellytulli-blue?logo=github)](https://ghcr.io/maelmoreau21/jellytulli)

---

## Aperçu

JellyTulli est un service autonome d'observabilité pour **Jellyfin** : sessions en direct, historique enrichi, télémétrie de lecture, analyses avancées, backups automatiques et intégration webhook.

Le projet est optimisé pour un déploiement **Docker Compose** (Raspberry Pi / x86) avec image publiée sur **GHCR**.

### Fonctionnalités clés

| Domaine | Détails |
| --- | --- |
| Dashboard live | Streams actifs, débit, ratio Direct Play/Transcode, charge temps réel |
| Historique | Sessions complètes, filtres, recherche, logs de lecture |
| Télémétrie | Événements playback (`start/progress/stop`, pauses, seek, changements audio/sous-titres) |
| Analytics | KPI globaux, tendances horaires/journalières, top contenus, graphiques de complétion |
| Wrapped | Récap annuel par utilisateur (style Spotify Wrapped) |
| Sauvegardes | Exports/imports JSON + backup auto avec rotation |
| Sécurité | RBAC, NextAuth, webhook avec secret partagé, rate limiting login |
| i18n | Interface bilingue FR/EN (next-intl) avec sélection de langue |

---

## Stack

| Couche | Technologie |
| --- | --- |
| Front/Back | Next.js 15 (App Router, Server Components, standalone) |
| Données | PostgreSQL + Prisma |
| Temps réel | Redis |
| UI | TailwindCSS + shadcn/ui + Recharts |
| Auth | NextAuth |
| CI/CD | GitHub Actions + GHCR |

---

## Déploiement Docker (GHCR)

### 1) Cloner le dépôt

```bash
git clone https://github.com/maelmoreau21/JellyTulli.git
cd JellyTulli
```

### 2) Configurer `docker-compose.yml`

Adapte les variables sensibles et réseau avant démarrage :

```yaml
services:
  jellytulli:
    image: ghcr.io/maelmoreau21/jellytulli:latest
    environment:
      # PostgreSQL (DATABASE_URL est construit automatiquement au démarrage)
      POSTGRES_USER: jellytulli
      POSTGRES_PASSWORD: "change-me"
      POSTGRES_IP: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: jellytulli

      # Redis
      REDIS_URL: redis://redis:6379

      # Jellyfin
      JELLYFIN_URL: http://jellyfin:8096
      JELLYFIN_API_KEY: change-me

      # Sécurité
      ADMIN_PASSWORD: change-me
      NEXTAUTH_SECRET: change-me
      NEXTAUTH_URL: http://your-host:3000
      JELLYFIN_WEBHOOK_SECRET: change-me

      # Runtime
      PUID: 1000
      PGID: 1000
      PORT: 3000
      BACKUP_DIR: /data/backups
```

> Important : en **production**, si `JELLYFIN_WEBHOOK_SECRET` est absent, les appels webhook sont rejetés (`401`).

### 3) Lancer la stack

```bash
docker compose up -d
```

### 4) Accéder à l'application

- URL : `http://<host>:3000`
- Connexion admin via `ADMIN_PASSWORD`
- Puis configuration Jellyfin dans l'interface (ou via variables déjà définies)

---

## Configuration du webhook Jellyfin

1. Installer le plugin **Webhook** dans Jellyfin.
2. Créer un webhook de type **Generic Destination**.
3. URL : `http://<host-jellytulli>:3000/api/webhook/jellyfin`
4. Événements : `Playback Start`, `Playback Progress`, `Playback Stop`.
5. Ajouter un header d'authentification :
   - `Authorization: Bearer <JELLYFIN_WEBHOOK_SECRET>`

Mode fallback supporté : `?token=<secret>` dans l'URL (moins recommandé que le header).

---

## Mises à jour

```bash
docker compose pull
docker compose up -d
```

Option recommandée : épingler un tag GHCR explicite (ex: `ghcr.io/maelmoreau21/jellytulli:v1.4.0`) au lieu de `latest` pour des mises à jour contrôlées.

---

## Développement local

```bash
npm ci
docker compose up postgres redis -d
```

Créer un `.env.local` :

```bash
DATABASE_URL="postgresql://jellytulli:jellytulli_password@localhost:5432/jellytulli?schema=public&connection_limit=5"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_SECRET="dev-secret"
NEXTAUTH_URL="http://localhost:3000"
JELLYFIN_WEBHOOK_SECRET="dev-webhook-secret"
```

Puis :

```bash
npx prisma db push
npm run dev
```

---

## Variables d'environnement

| Variable | Défaut | Obligatoire | Description |
| --- | --- | --- | --- |
| `POSTGRES_USER` | `jellytulli` | Oui (Docker) | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `jellytulli_password` | Oui (prod) | Mot de passe PostgreSQL |
| `POSTGRES_IP` | `postgres` | Oui (Docker) | Hôte PostgreSQL |
| `POSTGRES_PORT` | `5432` | Oui | Port PostgreSQL |
| `POSTGRES_DB` | `jellytulli` | Oui | Base PostgreSQL |
| `DATABASE_URL` | auto-construit | Non* | URL complète si fournie manuellement |
| `REDIS_URL` | `redis://redis:6379` | Oui | URL Redis |
| `JELLYFIN_URL` | — | Oui | URL Jellyfin |
| `JELLYFIN_API_KEY` | — | Oui | Clé API Jellyfin |
| `JELLYFIN_WEBHOOK_SECRET` | — | Oui (prod) | Secret d'authentification des webhooks |
| `ADMIN_PASSWORD` | — | Oui | Mot de passe admin JellyTulli |
| `NEXTAUTH_SECRET` | — | Oui | Secret NextAuth/JWT |
| `NEXTAUTH_URL` | — | Oui | URL publique de l'application |
| `PORT` | `3000` | Non | Port d'écoute interne |
| `PUID` | `1001` | Non | UID runtime du process dans le conteneur |
| `PGID` | `1001` | Non | GID runtime du process dans le conteneur |
| `BACKUP_DIR` | `/data/backups` | Non | Répertoire de backup JSON |

\* `DATABASE_URL` est généré automatiquement par l'entrypoint à partir des `POSTGRES_*` si absent.

---

## Volumes Docker

| Volume | Description |
| --- | --- |
| `jellytulli_pgdata` | Données PostgreSQL |
| `jellytulli_redisdata` | Données Redis |
| `jellytulli_backups` | Exports + backups automatiques |

---

## Licence

Projet personnel — usage privé.

---

Built with Next.js, Prisma, Redis & beaucoup de ☕
