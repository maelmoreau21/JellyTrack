# JellyTrack v3

JellyTrack v3 est une réécriture complète et optimisée de l'application de suivi et de statistiques pour Jellyfin. Elle remplace intégralement l'ancienne pile (Next.js 16, TypeScript, Prisma, PostgreSQL et Valkey/Redis) par un **binaire unique en Go** intégrant sa base de données embarquée et son interface moderne, fonctionnant dans un **unique conteneur Docker léger**.

---

## Sommaire

1. [Points clés et gains de performance](#points-clés-et-gains-de-performance)
2. [Démarrage rapide (Quick Start)](#démarrage-rapide-quick-start)
3. [Guide de migration depuis la v2 (PostgreSQL vers SQLite)](#guide-de-migration-depuis-la-v2-postgresql-vers-sqlite)
4. [Procédure de Rollback](#procédure-de-rollback)
5. [Configuration et variables d'environnement](#configuration-et-variables-denvironnement)
6. [Intégration du plugin Jellyfin](#intégration-du-plugin-jellyfin)
7. [Authentification et sécurité](#authentification-et-sécurité)
8. [Sauvegardes et maintenance automatique](#sauvegardes-et-maintenance-automatique)
9. [Durcissement et sécurité du conteneur](#durcissement-et-sécurité-du-conteneur)
10. [Monitoring et profilage](#monitoring-et-profilage)
11. [Développement et validation](#développement-et-validation)

---

## Points clés et gains de performance

- **Empreinte mémoire ultra-faible :** Moins de 40 Mo de RAM consommée au repos (contre plus de 500 Mo auparavant avec Node.js, Prisma et PostgreSQL).
- **Zéro dépendance externe obligatoire :** Aucun service PostgreSQL ou Valkey/Redis requis. Base SQLite embarquée ultra-rapide en mode WAL (*Write-Ahead Logging*).
- **Conteneur unique et autonome :** Un seul exécutable statique Go embarquant le frontend React 19 / Vite compilé. Pas d'interpréteur Node.js en production.
- **Compatibilité ascendante totale :** Respect strict du contrat d'API du plugin C# Jellyfin (`POST /api/plugin/events`), déduplication des événements et support des clés chiffrées avec pepper scrypt.
- **Support optionnel de PostgreSQL externe :** Possibilité de continuer à utiliser une base PostgreSQL managée externe via simple variable d'environnement (`DATABASE_DRIVER=postgres`).

---

## Démarrage rapide (Quick Start)

### 1. Préparation du fichier d'environnement

Depuis la racine du dépôt sous PowerShell :

```powershell
Copy-Item v3/.env.example v3/.env
```

Éditez `v3/.env` pour définir vos secrets de production :
- `NEXTAUTH_SECRET` : chaîne aléatoire sécurisée d'au moins 32 caractères.
- `PLUGIN_KEY_PEPPER` : clé secrète aléatoire servant au hachage des clés d'API plugin.
- `JELLYFIN_URL` : URL de votre serveur Jellyfin (ex: `http://jellyfin:8096`).
- `JELLYFIN_API_KEY` : clé d'API d'administration générée dans Jellyfin.

### 2. Lancement du conteneur

```powershell
docker compose --env-file v3/.env -f v3/docker-compose.yml up --build -d
```

### 3. Accès à l'application

- Interface web : [http://localhost:3000](http://localhost:3000)
- Sonde de santé : [http://localhost:3000/api/health](http://localhost:3000/api/health)

Pour arrêter le conteneur :

```powershell
docker compose --env-file v3/.env -f v3/docker-compose.yml down
```

---

## Guide de migration depuis la v2 (PostgreSQL vers SQLite)

Si vous utilisiez JellyTrack v2 avec une base de données PostgreSQL, suivez ces étapes pour migrer l'ensemble de votre historique de lecture et de vos configurations vers la v3.

### Étape 1 : Sauvegarde préventive de la base PostgreSQL v2

Avant toute manipulation, réalisez un export complet de votre base PostgreSQL :

```powershell
pg_dump -h HOTE_POSTGRES -p 5432 -U UTILISATEUR -d NOM_BASE -F c -b -v -f jellytrack_backup_v2.dump
```

### Étape 2 : Arrêt de l'ancienne application v2

Arrêtez l'ancienne stack pour vous assurer qu'aucun nouvel événement n'est écrit pendant l'import :

```powershell
docker compose down
```

### Étape 3 : Importation des données vers le fichier SQLite v3

JellyTrack v3 intègre un outil d'import dédié `import-postgres`. Il se connecte en lecture seule à votre base PostgreSQL existante, crée un fichier SQLite optimisé, copie les 11 tables dans l'ordre strict des dépendances (clés étrangères) et valide le nombre d'enregistrements table par table.

Depuis PowerShell :

```powershell
$env:DATABASE_URL = "postgresql://UTILISATEUR:MOT_DE_PASSE@HOTE_POSTGRES:5432/NOM_BASE?sslmode=disable"

docker run --rm `
  --entrypoint /jellytrack `
  -v "${PWD}:/import" `
  -e DATABASE_URL `
  ghcr.io/maelmoreau21/jellytrack:v3-latest `
  import-postgres --target /import/jellytrack.db
```

> **Note :** Le fichier cible `/import/jellytrack.db` ne doit pas exister avant l'import. L'outil refusera d'écraser un fichier existant afin de prévenir toute perte de données accidentelle.

### Étape 4 : Déploiement du fichier SQLite dans le volume Docker

Créez le volume Docker de données et copiez-y le fichier généré :

```powershell
# Créer le volume s'il n'existe pas encore
docker volume create jellytrack_data

# Copier le fichier SQLite importé dans le volume /data
docker run --rm -v "${PWD}:/source" -v jellytrack_data:/data alpine sh -c "cp /source/jellytrack.db /data/jellytrack.db && chown -R 65532:65532 /data"
```

### Étape 5 : Démarrage de JellyTrack v3

Lancez JellyTrack v3 :

```powershell
docker compose --env-file v3/.env -f v3/docker-compose.yml up -d
```

Consultez les journaux pour vérifier le bon démarrage :

```powershell
docker logs -f jellytrack-v3
```

---

## Procédure de Rollback

En cas d'imprévu ou de nécessité de revenir à la v2 :

1. Arrêtez le conteneur v3 :
   ```powershell
   docker compose --env-file v3/.env -f v3/docker-compose.yml down
   ```
2. Votre base de données PostgreSQL v2 n'a pas été modifiée par l'outil d'importation (qui opère exclusivement en lecture).
3. Redémarrez simplement l'ancienne stack v2 :
   ```powershell
   docker compose -f docker-compose.v2.yml up -d
   ```

---

## Configuration et variables d'environnement

| Variable | Valeur par défaut | Description |
|---|---|---|
| `PORT` / `JELLYTRACK_PORT` | `3000` | Port d'écoute interne du serveur HTTP. |
| `APP_PORT` | `3000` | Port exposé sur la machine hôte via Docker. |
| `TZ` | `Europe/Paris` | Fuseau horaire utilisé pour le reporting et les agrégations. |
| `LOG_LEVEL` | `info` | Niveau de journalisation (`debug`, `info`, `warn`, `error`). |
| `GOMEMLIMIT` | `32MiB` | Plafond mémoire alloué au Garbage Collector de Go. |
| `DATABASE_DRIVER` | `sqlite` | Moteur de données : `sqlite` (défaut) ou `postgres`. |
| `DATABASE_PATH` | `/data/jellytrack.db` | Chemin du fichier de base de données SQLite. |
| `DATABASE_URL` | *(vide)* | Chaîne de connexion PostgreSQL si `DATABASE_DRIVER=postgres`. |
| `BACKUP_DIR` | `/data/backups` | Répertoire de stockage des sauvegardes automatiques. |
| `ENABLE_PPROF` | `false` | Active les endpoints de profilage Go sous `/debug/pprof/`. |
| `NEXTAUTH_SECRET` | *(obligatoire)* | Clé secrète de signature des sessions et cookies d'authentification. |
| `PLUGIN_KEY_PEPPER` | *(obligatoire)* | Secret cryptographique pour le hachage scrypt des clés de plugin. |
| `JELLYFIN_URL` | *(vide)* | URL du serveur Jellyfin pour la synchronisation et la validation. |
| `JELLYFIN_API_KEY` | *(vide)* | Clé d'API Jellyfin d'administration. |
| `JELLYFIN_SERVER_ID` | `master` | Identifiant logique du serveur Jellyfin principal. |
| `OIDC_ENABLED` | `false` | Active l'authentification OpenID Connect (Authentik, Keycloak, etc.). |
| `OIDC_ISSUER` | *(vide)* | URL de l'émetteur OIDC. |
| `OIDC_CLIENT_ID` | *(vide)* | Identifiant client OIDC. |
| `OIDC_CLIENT_SECRET` | *(vide)* | Secret client OIDC. |
| `OIDC_ADMIN_GROUP` | *(vide)* | Nom du groupe OIDC conférant les droits d'administrateur. |
| `RETENTION_DAYS` | `90` | Durée de conservation des journaux et événements de télémétrie. |

---

## Intégration du plugin Jellyfin

Le plugin C# JellyTrack s'intègre directement sans aucune modification de code :

1. Dans les paramètres du plugin dans Jellyfin, configurez l'URL d'ingestion :
   `http://ADRESSE_JELLYTRACK:3000/api/plugin/events`
2. Définissez votre clé d'API secrète.
3. Événements supportés :
   - `PlaybackStart` : initialisation d'une session de lecture.
   - `PlaybackProgress` : suivi en temps réel de la progression et de la position.
   - `PlaybackStop` : clôture de session, calcul du temps effectif et archivage.
   - `ItemDownloaded` / `DownloadCompleted` : enregistrement immédiat d'un téléchargement comme lecture complétée avec déduplication stricte par `sourceEventId`.

---

## Authentification et sécurité

JellyTrack v3 propose plusieurs modes d'authentification compatibles et cumulables :
- **Authentification locale :** Création du premier compte administrateur à l'initialisation si la base est vierge.
- **OpenID Connect (OIDC) :** Intégration transparente avec Authentik, Authelia ou Keycloak avec détection automatique des rôles via les groupes (`OIDC_ADMIN_GROUP`).
- **Authentification Jellyfin :** Possibilité de s'authentifier directement avec ses identifiants utilisateur Jellyfin.
- **Sécurité des sessions :**
  - Cookies de session signés cryptographiquement, configurés en `HttpOnly`, `Secure` et `SameSite=Lax`.
  - Protection CSRF obligatoire sur toutes les requêtes de mutation (`POST`, `PUT`, `DELETE`) via jeton HMAC.
  - Protection contre les attaques par force brute avec verrouillage automatique après 5 tentatives échouées par fenêtre de 15 minutes.

---

## Sauvegardes et maintenance automatique

Le planificateur interne s'exécute en arrière-plan sans aucun processus cron externe :
- **Synchronisation Jellyfin :** Récupération périodique des utilisateurs et des métadonnées multimédias.
- **Consolidation des sessions :** Regroupement des fragments de session orphelins et calcul des durées effectives.
- **Purge de télémétrie :** Nettoyage automatique des enregistrements dépassant le seuil de rétention configuré (`RETENTION_DAYS`).
- **Sauvegardes automatiques :** Génération quotidienne d'une archive ZIP sécurisée de la base SQLite sous `/data/backups`, avec rotation automatique conservant les 7 dernières sauvegardes.
- **Export et import manuel :** Disponibles directement depuis l'onglet Paramètres de l'interface ou via `/api/backup/export` et `/api/backup/import` (avec protection stricte contre le *Zip-Slip* et limitation de taille).

---

## Durcissement et sécurité du conteneur

L'image Docker v3 suit les meilleures pratiques de sécurité :
- **Image Distroless non-root :** Exécution sous l'utilisateur UID/GID `65532:65532`. Aucun shell (`/bin/sh`, `/bin/bash`), aucun gestionnaire de paquets et aucun outil tiers dans l'image finale.
- **Système de fichiers en lecture seule :** La racine du conteneur est montée en lecture seule (`read_only: true`). Seuls le volume persistant `/data` et le dossier temporaire `/tmp` (en mémoire `tmpfs` avec options `noexec,nosuid`) sont inscriptibles.
- **Privilèges restreints :** `cap_drop: ALL` et `no-new-privileges: true` dans la configuration Compose.
- **En-têtes de sécurité HTTP stricts :** Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options: nosniff, Referrer-Policy, X-Frame-Options: DENY.

---

## Monitoring et profilage

### Sonde de santé (Healthcheck)

Le conteneur intègre sa propre sonde interne exécutable sans curl :

```powershell
docker exec jellytrack-v3 /jellytrack healthcheck
```

Le statut HTTP est également interrogeable sur `/api/health` :

```powershell
curl.exe http://localhost:3000/api/health
```

### Profilage de performance avec pprof

Pour analyser la mémoire ou le processeur en cas de charge élevée :
1. Activez `ENABLE_PPROF=true` dans `v3/.env`.
2. Redémarrez le conteneur.
3. Les profils Go sont accessibles sur `http://localhost:3000/debug/pprof/`.

---

## Développement et validation

Pour valider le code source localement :

```powershell
# Exécuter l'ensemble des tests unitaires Go
cd v3
go test ./...

# Analyse statique du code Go
go vet ./...

# Compiler le frontend React / Vite
cd frontend
npm ci
npm run build
```
