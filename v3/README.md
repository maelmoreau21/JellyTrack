# JellyTrack v3 — phases 1 à 3

La v3 est isolée de l’application Next.js dans ce dossier. Pour lancer le premier squelette depuis la racine du dépôt sous PowerShell :

```powershell
Copy-Item v3/.env.example v3/.env
docker compose --env-file v3/.env -f v3/docker-compose.yml up --build -d
```

Ouvrir ensuite `http://localhost:3000`. Le contrôle de santé répond sur `http://localhost:3000/api/health`.

Pour arrêter le conteneur :

```powershell
docker compose --env-file v3/.env -f v3/docker-compose.yml down
```

Les données persistantes seront stockées dans le volume Docker `jellytrack_data`, monté sous `/data`. SQLite est le mode par défaut : la v3 crée son fichier, active WAL et applique ses migrations au démarrage. Aucun service PostgreSQL ou Valkey n’est créé par ce compose.

Tu peux garder une base PostgreSQL gérée à l’extérieur du conteneur : dans `v3/.env`, définis `DATABASE_DRIVER=postgres` et `DATABASE_URL` avec l’adresse de cette base. JellyTrack appliquera les migrations au démarrage. La base PostgreSQL externe doit être accessible depuis le conteneur et l’utilisateur SQL doit pouvoir créer les tables et index.

Pour copier les données existantes depuis PostgreSQL vers un nouveau fichier SQLite, arrête l’application qui utilise la source, puis exécute depuis PowerShell à la racine du dépôt :

```powershell
$env:DATABASE_URL = "postgresql://UTILISATEUR:MOT_DE_PASSE@HOTE:5432/NOM_BASE?sslmode=require"
docker run --rm --entrypoint /jellytrack -v "${PWD}:/import" -e DATABASE_URL ghcr.io/maelmoreau21/jellytrack:v3-latest import-postgres --target /import/jellytrack.db
```

La commande nécessite une image v3 déjà construite ou publiée. Le fichier cible doit ne pas exister. L’import copie progressivement les 11 tables, compare les nombres de lignes, puis crée le fichier cible seulement si les contrôles réussissent. Il ne modifie pas la base source. Protège le fichier SQLite et l’URL PostgreSQL comme des données sensibles.

La page visible est un écran temporaire de portage. Les fonctions de JellyTrack seront transférées dans les phases suivantes. Les traductions d’origine sont copiées sans modification sous `frontend/messages/`.

L’endpoint plugin reste `POST /api/plugin/events`, avec schéma d’événement v3, les alias `ItemDownloaded`/`DownloadCompleted`, clés existantes stockées sous forme scrypt avec `PLUGIN_KEY_PEPPER`, et déduplication des téléchargements par serveur et `sourceEventId`. Un téléchargement est enregistré comme une vue terminée.

Pour lancer les vérifications Go depuis `v3` :

```powershell
go test ./...
go vet ./...
```

Pour reconstruire uniquement le frontend en développement :

```powershell
Set-Location v3/frontend
npm ci
npm run build
Set-Location ../..
```

Les tests Go et la construction multi-étapes sont lancés pendant la construction de l’image.
