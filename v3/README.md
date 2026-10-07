# JellyTrack v3 — squelette de la phase 1

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

Les données persistantes seront stockées dans le volume Docker `jellytrack_data`, monté sous `/data`. Le réglage initial utilise SQLite. `DATABASE_DRIVER=postgres` et `DATABASE_URL` sont prévus pour garder un mode PostgreSQL externe; la connexion elle-même est ajoutée à la phase 2. Aucun service PostgreSQL ou Valkey n’est créé par ce compose.

La page visible est un écran temporaire de portage. Les fonctions de JellyTrack seront transférées dans les phases suivantes. Les traductions d’origine sont copiées sans modification sous `frontend/messages/`.

Pour reconstruire uniquement le frontend en développement :

```powershell
Set-Location v3/frontend
npm ci
npm run build
Set-Location ../..
```

Les tests Go et la construction multi-étapes sont lancés pendant la construction de l’image.
