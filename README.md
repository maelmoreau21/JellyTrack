
# 🍐 JellyTrack

Observabilité et analytics pour Jellyfin — sessions en direct, historique enrichi, métriques de lecture, backups et intégrations.

[![Docker Build](https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml)
[![GHCR Image](https://img.shields.io/badge/GHCR-ghcr.io%2Fmaelmoreau21%2FJellyTrack-blue?logo=github)](https://ghcr.io/maelmoreau21/JellyTrack)

---

## Aperçu

JellyTrack collecte et analyse les événements Jellyfin (playback start/progress/stop) pour fournir :

- Un dashboard temps réel des sessions et de la charge
- Un historique détaillé par utilisateur
- Des métriques et rapports (KPI, tops, taux de complétion)
- Des exports / backups JSON automatiques
- Une intégration simple via webhooks ou via le plugin Jellyfin

## Fonctionnalités principales

- Dashboard live (sessions actives, débit, Direct Play vs Transcode)
- Historique et recherche de sessions
- Télémétrie playback (start / progress / stop, pause, seek, changements audio/sous-titres)
- Backups JSON et rotation automatique
- Sécurité : RBAC, NextAuth, webhooks signés

## Stack

- Front/Back : Next.js 15 (App Router, Server Components)
- Données : PostgreSQL + Prisma
- Temps réel : Redis
- UI : TailwindCSS + shadcn/ui + Recharts
- Auth : NextAuth
- CI/CD : GitHub Actions + GHCR

## Important — Serveur & Plugin

- **Installation recommandée** : installez le serveur JellyTrack via Docker / GHCR, et installez le plugin Jellyfin via le dépôt Jellyfin.
- **Pourquoi** : le plugin envoie les événements de lecture (start / progress / stop) vers JellyTrack. Sans plugin ni configuration de webhooks côté Jellyfin, JellyTrack ne recevra aucune donnée et l'interface restera vide. Inversement, le plugin doit être configuré avec l'URL d'une instance JellyTrack opérationnelle — installé seul il n'aura pas d'effet visible.
- **Alternative** : si vous ne pouvez pas installer le plugin, vous pouvez configurer des webhooks Jellyfin pour pointer vers `/api/webhook/jellyfin`, mais le plugin reste la méthode la plus simple et complète.

## Quickstart — Docker (GHCR) — recommandé

1. Cloner le dépôt :

```bash
git clone https://github.com/maelmoreau21/JellyTrack.git
cd JellyTrack
```

2. Adapter `docker-compose.yml` / variables d'environnement (voir section Variables ci‑dessous).

3. Lancer la stack :

```bash
docker compose up -d
```

4. Ouvrir l'interface : `http://<host>:<APP_PORT>` (par défaut 3000) — se connecter avec `ADMIN_PASSWORD`.

## Plugin Jellyfin — installation (RECOMMANDÉE)

Privilégiez l'installation via le dépôt de plugins Jellyfin — c'est plus simple pour les mises à jour :

1. Dans Jellyfin → Tableau de bord → Plugins → Dépôts
2. Cliquer sur `+` (Ajouter)
3. Nom : **JellyTrack**
4. URL : `https://raw.githubusercontent.com/maelmoreau21/JellyTrack.Plugin/main/manifest.json`
5. Enregistrer → Catalogue → Rechercher **JellyTrack** → Installer → Redémarrer Jellyfin

L'installation manuelle (copie de la DLL) reste possible mais n'est pas recommandée pour la maintenance.

## Configuration du webhook Jellyfin

- URL : `http://<host-JellyTrack>:<APP_PORT>/api/webhook/jellyfin`
- Événements : `Playback Start`, `Playback Progress`, `Playback Stop`
- Header : `Authorization: Bearer <JELLYFIN_WEBHOOK_SECRET>`
- Fallback (moins sécurisé) : `?token=<secret>`

## Développement local

```bash
npm ci
docker compose up -d postgres redis
cp .env.example .env.local
# éditer .env.local puis :
npx prisma db push
npm run dev
```

## Variables d'environnement (essentielles)

- `DATABASE_URL` — URL PostgreSQL complète (ou utilisez les variables `DB_*`)
- `REDIS_URL` — ex: `redis://localhost:6379`
- `JELLYFIN_URL` — URL de Jellyfin
- `JELLYFIN_API_KEY` — clé API Jellyfin (si nécessaire)
- `JELLYFIN_WEBHOOK_SECRET` — secret pour valider les webhooks (production)
- `ADMIN_PASSWORD` — mot de passe admin initial
- `NEXTAUTH_SECRET` — secret NextAuth/JWT
- `NEXTAUTH_URL` — URL publique
- `PORT` / `APP_PORT` — ports d'écoute

Voir `docker-compose.yml` pour un exemple complet.

## Mises à jour

```bash
docker compose pull
docker compose up -d
```

Pour plus de contrôle, épinglez un tag GHCR explicite plutôt que `latest`.

## Licence

Projet personnel — usage privé.

---

Built with Next.js, Prisma, Redis & beaucoup de ☕
