# Comparaison avec main — 14 octobre 2026

Vérification distante effectuée avec `git fetch origin main`.

- Main actuel : `e80c5e88db0bfd8f2fce080c66d92d1cd629e016`, Go/vanilla.
- Point de départ de la migration : `325af151d16d267c5a1c6d32712daca5c45c9051`.
- Main est un ancêtre de ce point de départ ; trois commits supplémentaires
  ajoutent des fonctions API/authentification/multi-serveur. Aucun merge nécessaire.
- Ancienne référence React/Next : `a59a28613e63e86106c61827167d355b47147f42`.
  Ne pas confondre cette ancienne version avec le main distant actuel.

## Ce que main apporte à la comparaison

Les CSS, polices, logos et images de `web/dist` ne diffèrent pas entre main actuel
et notre point de départ. Les différences de JavaScript concernent principalement
les ajouts de notre branche : comptes associés, Wrapped combiné, sélection du
serveur au login, sauvegardes chiffrées `.jtb`, rôle super_admin, événements SSE,
chargement différé et protection de l'identité serveur/échappement. Ne pas copier
les anciens modules de main en supprimant ces fonctions.

L'ancienne interface React conserve des références utiles pour les prochains
composants : `DraggableDashboard`, `CollapsibleCard`, `HardwareMonitor`,
`SystemHealthWidgets`, `LiveStreamsPanel`, `GranularAnalysis` et `NetworkAnalysis`.
Les comparer avec le frontend Go courant lors de leur conversion, en conservant
les fonctions Go ajoutées. L'ancien audit `docs/FINAL_PARITY_AUDIT.md` reste une
liste de différences historiques ; il ne certifie pas le frontend Svelte actuel.

## Preuve visuelle obtenue aujourd'hui

Les huit captures dashboard stabilisées (animations neutralisées seulement pour
la prise de capture) donnent **zéro pixel différent** entre le frontend Go courant
et le build Svelte statique. Elles couvrent FR/EN, clair/sombre, 390/1440 px.

Commandes depuis la racine, avec Pillow disponible pour le comparateur :

```powershell
cd frontend
npm run build
npm run test:dashboard -- --production
cd ..
python frontend/scripts/compare-dashboard-pixels.py
```

Résultats : `scratch/frontend-sveltekit-dashboard-qa/pixel-comparison.json`.
Les captures ont une hauteur de 900 px : cette preuve concerne seulement la zone
visible. Les API sont simulées, les séries de graphiques sont vides et les événements
live sont remplacés par une fixture. Elle ne prouve ni les sections inférieures,
ni toutes les pages, ni une égalité avec l'ancien React main.

## État réel

La migration reste partielle : cadre, barre latérale, connexion, À propos et
structure/KPI dashboard convertis. Les autres pages et les contrôleurs graphiques
restent à convertir. À propos actualise volontairement son texte de technologie,
ce qui constitue déjà une différence de texte avec la référence.

Une identité visuelle globale ne peut être annoncée qu'après comparaison des
autres routes, états de chargement/erreur, données non vides, langues et formats.
