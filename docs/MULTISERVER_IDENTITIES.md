# Identités, confidentialité et restauration

Une session reste attachée à un seul compte Jellyfin et à son serveur. Une association volontaire permet de combiner les statistiques personnelles de plusieurs comptes ; elle ne fusionne ni les permissions, ni les historiques, ni les bibliothèques autorisées. Les noms et les emails ne prouvent jamais une association.

## Rôles

| Rôle | Périmètre |
| --- | --- |
| `user` | Son profil, son historique et les bibliothèques de son compte courant ; Wrapped des comptes explicitement associés. |
| `server_admin` | Même identité courante ; observation et synchronisation de son propre serveur via `/api/me/server`, avec vérification de la politique Jellyfin actuelle. |
| `super_admin` | Administration globale, paramètres, sauvegardes, dashboard et newsletter globaux. |

L'administrateur local JellyTrack reçoit `super_admin`. Un administrateur Jellyfin ou un groupe OIDC administrateur reçoit `server_admin`. Pour accorder volontairement l'administration globale à une identité distante, définir une liste contrôlée par l'opérateur :

```dotenv
JELLYTRACK_SUPER_ADMIN_IDENTITIES='[{"serverId":"identifiant-interne-du-serveur","userId":"identifiant-jellyfin-immuable"}]'
```

Retirer une entrée retire son privilège global aux requêtes suivantes. La migration `008_person_accounts.sql` révoque les anciennes sessions et exige une reconnexion. Les comptes Jellyfin n'héritent jamais du privilège d'un compte associé.

## Associer ses comptes

1. Se connecter à son premier compte depuis moins de dix minutes et ouvrir **Mes comptes** (`/accounts`).
2. Dans une fenêtre privée distincte, se connecter au second compte. Le sélecteur de connexion permet de choisir explicitement un serveur autorisé, même si les identifiants sont identiques.
3. Sur **Mes comptes** du second compte, générer un code et le saisir dans la première fenêtre.
4. Le code expire après cinq minutes, est stocké sous forme de hash et ne peut être consommé qu'une fois. Il est invalidé par une dissociation ou la révocation de sa session.

Huit comptes maximum peuvent être associés. Les opérations sont transactionnelles : un compte déjà associé à plusieurs comptes d'une autre personne ne peut pas être absorbé. Une dissociation prend effet au prochain calcul, même sans reconnexion. Les comptes désactivés et serveurs inactifs ne sont pas utilisables pour établir une identité.

La connexion LDAP reste soumise à `LDAP_SSO_ONLY`. Il ne faut pas la désactiver pour associer un compte. Avec OIDC, une sélection secondaire nécessite des identifiants supplémentaires dans une claim **signée et contrôlée par l'administrateur du fournisseur** :

```json
{
  "jellyfin_server_id": "serveur-principal",
  "jellyfin_user_id": "utilisateur-principal",
  "jellyfin_accounts": [
    {"serverId": "serveur-secondaire", "userId": "utilisateur-secondaire"}
  ]
}
```

La sélection n'établit aucune identité par elle-même : elle doit correspondre exactement à une seule entrée signée, à un serveur autorisé et à un compte vérifié auprès de Jellyfin. La connexion au second compte ne l'associe pas automatiquement au premier ; le code volontaire reste nécessaire.

## Wrapped personnel multi-serveur

Le lien **Mon Wrapped multi-serveur privé** ouvre `/wrapped/me?combined=1`. L'API `/api/me/wrapped?year=2025` calcule les statistiques sur les couples `(userId, serverId)` chargés côté serveur. Les filtres du navigateur ne peuvent pas étendre ce périmètre.

Les classements de médias restent distincts par serveur, même lorsque les titres ou identifiants Jellyfin sont identiques. Le résultat conserve la provenance de chaque média. Aucun classement d'autres utilisateurs ni partage public n'est ajouté.

Les permissions de chaque compte sont relues pour chaque Wrapped. Si un serveur ne répond pas, si un compte est désactivé ou si les droits sont invérifiables, le calcul refuse de retourner un résultat. L'ancien endpoint `/api/wrapped/{id}` applique aussi la politique actuelle des bibliothèques et les règles de visibilité/calendrier. Les droits du compte associé n'ouvrent pas ses images, son profil ou ses bibliothèques à la session courante.

## Sauvegardes

| Export | Contenu et restauration |
| --- | --- |
| ZIP standard | Données et paramètres non secrets, associations incluses. Clés Jellyfin/plugin, SSO enregistré et webhook Discord omis. Après restauration, réassocier les connexions dont les clés ne sont plus disponibles. |
| Export complet `.jtb` | ZIP chiffré et authentifié avec AES-256-GCM, comprenant les secrets enregistrés et les clés des serveurs. |
| Copie avant réparation `.sqlite.jtb` | Copie SQLite complète chiffrée, vérifiée avant toute réparation ou suppression. |

L'export de données lit une transaction cohérente. Il exporte toutes les colonnes des tables incluses et échoue en cas d'erreur, plutôt que d'omettre silencieusement des lignes. Les sessions et les codes d'association ne sont pas restaurés. Le faux `database.sql` a été retiré ; les ZIP contiennent les données JSON réellement restaurables.

Définir `BACKUP_ENCRYPTION_KEY` avec exactement 32 octets aléatoires encodés en base64 et conserver cette clé **séparément** des archives. Ne pas utiliser la clé connue des fixtures de tests. Exemple de génération dans PowerShell :

```powershell
$backupKeyBytes = New-Object byte[] 32
$backupRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$backupRng.GetBytes($backupKeyBytes)
[Convert]::ToBase64String($backupKeyBytes)
$backupRng.Dispose()
```

Avec cette variable, les sauvegardes automatiques sont complètes et chiffrées. Sans elle, elles sont standard et sans secrets ; l'export complet et les réparations qui nécessitent une copie SQLite complète refusent de démarrer. Les trois fichiers Compose transmettent cette variable. Les fichiers de sauvegarde sont créés avec le mode `0600`.

Le formulaire d'import accepte les ZIP et `.jtb` produits par l'export de données. Une copie SQLite chiffrée de réparation se récupère avec la commande suivante, en définissant auparavant la clé dans l'environnement :

```powershell
.\jellytrack.exe decrypt-backup "copie.sqlite.jtb" "copie.sqlite"
```

La commande refuse d'écraser un fichier existant. La restauration d'une copie SQLite physique se fait serveur arrêté, après sauvegarde de l'installation courante. Les paramètres et secrets gérés exclusivement par l'environnement restent à conserver séparément : une sauvegarde de base ne remplace pas `.env` ou le gestionnaire de secrets.

## Diagnostics et performances

- Pprof est désactivé par défaut ; tous ses chemins exigent un administrateur global lorsqu'il est activé.
- Les clients Jellyfin ne suivent plus les redirections. Le transport vérifie les IP réellement résolues puis compose la connexion vers l'IP contrôlée, en conservant les destinations LAN légitimes.
- Les en-têtes de proxy n'influencent les origines et les redirections OIDC que si le pair réseau appartient aux CIDR explicitement autorisés.
- Les images sont autorisées avant le proxy, bornées à 16 Mio, limitées aux formats raster et servies avec un cache privé. Les en-têtes et cookies arbitraires de Jellyfin ne sont pas retransmis.
- Le dashboard accumule ses graphiques pendant la lecture des lignes, sans conserver une copie complète de l'historique. Son cache est limité à cinq secondes et à 32 filtres.
- Le cache de permissions des bibliothèques expire après dix secondes ; le Wrapped utilise une lecture fraîche. Les synchronisations, changements de serveur et restaurations invalident les caches concernés.
- Une connexion SSE remplace les trois boucles d'actualisation périodique du dashboard. L'autorisation est revérifiée à chaque livraison ; les modules de page et Chart.js sont chargés lorsque la page en a besoin.

## Contrôles reproductibles

```powershell
go test ./...
go vet ./...
go test ./internal/stats -run '^$' -bench BenchmarkDashboardLargeHistory -benchmem -benchtime=1x
```

`go test -race ./...` nécessite CGO et un compilateur C. Les tests PostgreSQL utilisent `JELLYTRACK_TEST_POSTGRES_URL` pointant vers une instance locale de test ; chaque test crée puis supprime uniquement son schéma isolé. Le CI inclut ce service et conserve les résultats visuels comme artefacts, au lieu d'ajouter de nouvelles captures dans Git.

Le script `scripts/security-qa/browser.cjs` vérifie le parcours réel du navigateur avec deux serveurs simulés et une base jetable. Il n'utilise aucun compte de production. Ces contrôles ne remplacent pas un test de lecture Jellyfin, une validation réelle du fournisseur OIDC ou un pentest de l'installation.

## Captures historiques

`docs/AUDIT_ASSET_ARCHIVE.json` indexe les fichiers déplacés, leurs tailles, leurs hashes et la révision d'origine. Les illustrations du README restent suivies. Les liens des rapports vers les captures archivées utilisent la révision GitHub immuable d'origine.

L'archive externe du 13 octobre 2026 est `2026-10-13-audit-assets-6f0109c.zip`. Son manifeste permet de vérifier et de récupérer les anciennes preuves. Cette opération réduit le checkout courant ; elle ne réécrit pas l'historique Git et ne réduit donc pas à elle seule les anciens objets d'un clone complet. Aucun push forcé n'est requis.
