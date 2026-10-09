# Validation Paramètres et Administration

Ces scripts testent une copie Go sur `127.0.0.1:3340` avec la base synthétique `scratch/settings-admin-qa/settings-admin.db`. Ils refusent toute autre destination. Les sessions administrateur et utilisateur standard sont réelles ; aucune réponse d'identité ou de rôle n'est remplacée. Ils n'exécutent pas de restauration, suppression, import, consolidation ou nettoyage.

Les serveurs synthétiques sont désactivés et ciblent uniquement `127.0.0.1:9`. Le lanceur démarre Go dans un répertoire ignoré sans `.env`, efface les variables applicatives héritées dans le processus enfant et fixe un répertoire de sauvegardes isolé. Les mots de passe et cookies sont exclusivement des fixtures. Aucune dépendance de test n'est ajoutée au produit.

## Go

Depuis la racine du dépôt :

```powershell
python scripts/settings-admin-qa/run-isolated.py
python scripts/settings-admin-qa/seed.py
$env:PLAYWRIGHT_MODULE='chemin absolu du module playwright déjà installé'
node scripts/settings-admin-qa/browser.cjs
python scripts/settings-admin-qa/seed.py
node scripts/settings-admin-qa/forms.cjs
node scripts/settings-admin-qa/admin.cjs
node scripts/settings-admin-qa/modes.cjs
python scripts/settings-admin-qa/run-isolated.py --stop
```

`run-isolated.py` reconstruit le binaire embarquant les assets courants avant démarrage. Arrêter le processus enregistré avant toute reconstruction ou redémarrage ; le lanceur vérifie son identité avant de l'arrêter. Les résultats sont écrits dans `docs/settings-admin-validation/go-results.json`, les captures dans `docs/settings-admin-captures`.

Relancer `seed.py` avant chaque passage de `forms.cjs` : les scénarios changent réellement la configuration synthétique, et le bouton d'exclusion est un toggle. `forms.cjs` emploie aussi Python pour vérifier les secrets synthétiques ; si nécessaire fixer `$env:PYTHON` au chemin du runtime Python. Le lanceur isole explicitement les logs et sauvegardes et retire le pepper plugin hérité.

Pour vérifier le mode mono-serveur après arrêt du mode multi : lancer `run-isolated.py --single`, fixer `$env:QA_MODE='single'`, exécuter `modes.cjs`, puis arrêter le serveur. Les deux modes ont six contrôles réels chacun.

## Référence historique

L'exécution historique réutilise l'archive ignorée `scratch/navigation-qa/main-reference` préparée par les suites navigation/utilisateurs. Elle exige les dépendances de cette archive et son adaptateur Prisma synthétique. `main` reste en lecture seule. Le petit complément d'adaptateur fourni ici expose la relation média/historique nécessaire aux pages Santé et Nettoyage, sans modifier leurs composants ou styles.

Sur cette machine, SWC nécessite un cache court à cause des ACL AppData et de la longueur des chemins Windows. Si `Q:` est libre :

```powershell
subst Q: "$PWD\scratch\navigation-qa\swc-cache"
python scripts/settings-admin-qa/prepare-reference.py
python scripts/settings-admin-qa/run-isolated.py --reference
$env:REFERENCE_URL='http://127.0.0.1:3341'
node scripts/settings-admin-qa/reference-captures.cjs
python scripts/settings-admin-qa/run-isolated.py --reference --stop
subst Q: /D
```

Ne pas remplacer une association `Q:` existante. Next n'emploie aucune base réelle (`PRISMA_USE_STUB=true`) et reçoit un secret NextAuth synthétique. La compilation et la maintenance de développement travaillent uniquement dans l'archive ignorée et sur le stub. La référence disponible utilise Next 16.4.0 ; le manifeste historique demandait Next 16.3.7. Les captures comparent les mêmes viewports, mais ne constituent pas une assertion d'identité pixel par pixel.

`QA_ROUTES` permet de borner une capture historique aux routes séparées par des virgules. Les comptes rendus enregistrent séparément erreurs JavaScript, réponses HTTP en erreur et échec de rendu. Une capture d'un écran de chargement ou d'erreur n'est jamais déclarée comme restauration réussie.
