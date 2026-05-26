<p align="center">
  <img src="public/logo.svg" width="128" height="128" alt="JellyTrack Logo">
</p>

<h1 align="center">JellyTrack</h1>

<p align="center">
  <a href="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml"><img src="https://github.com/maelmoreau21/JellyTrack/actions/workflows/docker-publish.yml/badge.svg" alt="Docker Build"></a>
  <a href="https://ghcr.io/maelmoreau21/JellyTrack"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fmaelmoreau21%2FJellyTrack-blue?logo=github" alt="GHCR Image"></a>
</p>

<p align="center">
  <strong>Observabilité et analytics pour Jellyfin : sessions en direct, historique enrichi et métriques de lecture.</strong>
</p>

---

> [!CAUTION]
> ### 🚨 LE PLUGIN JELLYFIN EST OBLIGATOIRE
> JellyTrack **ne peut pas** collecter de données sans son plugin compagnon installé sur votre serveur Jellyfin.
> 
> [👉 Cliquez ici pour configurer le plugin](https://github.com/maelmoreau21/Jellyfin.Plugin.JellyTrack)

---

## 🚀 Installation Docker

Le dépôt contient déjà un `docker-compose.yml` complet. La méthode recommandée est donc :

### 1. Configuration

```bash
cp .env.example .env
```

Modifiez `.env` et remplacez toutes les valeurs `CHANGE_ME_*`.

Important pour Docker : si Jellyfin tourne dans un autre conteneur ou sur une autre machine, `JELLYFIN_URL` doit être une adresse joignable depuis le conteneur JellyTrack. Évitez `127.0.0.1` sauf si Jellyfin est dans le même conteneur.

### 2. Lancement ou mise à jour

```bash
docker compose pull
docker compose up -d
```

Pour tester une modification locale avant publication de l'image :

```bash
docker build -t ghcr.io/maelmoreau21/jellytrack:latest .
docker compose up -d
```

### 3. Accès

Rendez-vous sur `http://localhost:3000` et connectez-vous avec votre `ADMIN_PASSWORD`.

### Jellyfin 10.12 / 12 beta

JellyTrack utilise l'en-tête `Authorization: MediaBrowser Token="..."` pour les appels Jellyfin récents. Les anciens accès par clé API dans l'URL (`?ApiKey=...`) ont été retirés.

1. Créez une clé API dans Jellyfin : **Tableau de bord** > **Avancé** > **Clés API**.
2. Renseignez `JELLYFIN_API_KEY` dans `.env`.
3. Installez ou mettez à jour le plugin compagnon JellyTrack.
4. Dans JellyTrack, allez dans **Paramètres** > **Connexion Jellyfin**, générez la clé plugin, puis copiez l'URL plugin et la clé dans la configuration du plugin Jellyfin.

### Base existante / erreur Prisma P3005

Si les logs affichent `Error: P3005` et `The database schema is not empty`, la base existe déjà mais n'a pas encore la table d'historique Prisma. Le conteneur sait maintenant baseliner les migrations incluses puis synchroniser le schéma sans accepter de perte de données par défaut.

Si vous voulez repartir de zéro, supprimez le volume PostgreSQL avec prudence :

```bash
docker compose down
docker volume rm jellytrack_JellyTrack_pgdata
docker compose up -d
```

---

## 🌟 Fonctionnalités

- **Dashboard Live** : Visualisez qui regarde quoi en temps réel (Direct Play vs Transcode, débit, etc.).
- **Historique Enrichi** : Détails techniques complets (codecs, sous-titres, langues).
- **Statistiques & Tendances** : Tops utilisateurs, médias les plus vus, graphiques d'activité.
- **Journaux Système & Audit** : Suivi de la santé de la synchronisation.
- **Sécurité** : Authentification via Jellyfin, hachage des clés API, support multi-serveur.

---

## 🔌 Configuration du Plugin

Une fois le serveur installé, vous devez configurer le plugin sur votre instance Jellyfin pour commencer à recevoir des données.

**Dépôt du Plugin :** [Jellyfin.Plugin.JellyTrack](https://github.com/maelmoreau21/Jellyfin.Plugin.JellyTrack)

1. Dans Jellyfin : **Tableau de bord** > **Plugins** > **Dépôts**.
2. URL du dépôt : `https://raw.githubusercontent.com/maelmoreau21/Jellyfin.Plugin.JellyTrack/main/manifest.json`
3. Installez le plugin **JellyTrack** depuis le catalogue.

---

## 📄 Licence

Projet personnel — usage privé.
Built with Next.js, Prisma, Redis & beaucoup de ☕
