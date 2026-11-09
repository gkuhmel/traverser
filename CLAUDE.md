# Traverser — instructions pour Claude Code

Jeu web mobile (Safari iPhone, portrait) : traverser une rue de Hanoï saturée de scooters en avançant sans jamais hésiter.

## Référence
- La spécification complète est dans `docs/specs.md`. La lire avant toute tâche.
- Le cœur du proto est l'IA d'évitement prédictif des scooters (§5 de la spec) : c'est elle qu'on règle, le reste est au service de cette sensation.

## Méthode
- Avancer **étape par étape** selon le §10 de la spec. À la fin de chaque étape : résumer ce qui a été fait, indiquer comment tester sur iPhone, puis **s'arrêter et attendre la validation** avant l'étape suivante.
- Ne rien ajouter qui soit dans « Exclus » (§2) sans demande explicite.
- Tous les paramètres de gameplay vont dans `src/config.ts`, jamais en dur dans le code.

## Conventions techniques
- Vite + TypeScript strict, aucun framework UI, Canvas 2D.
- Boucle à pas de temps fixe ; l'IA ne doit pas dépendre du framerate.
- Unités du monde en mètres et secondes ; conversion en pixels uniquement dans le rendu.
- Pointer Events avec `touch-action: none` ; pas de zoom, de scroll ni de sélection.
- `localStorage` toujours entouré d'un `try/catch`.
- Le panneau de debug s'active avec `?debug=1` et ne doit rien coûter quand il est désactivé.

## Commandes
- `npm run dev -- --host` pour tester sur iPhone sur le réseau local.
- `npm run build` doit passer sans erreur TypeScript avant chaque fin d'étape.
- `npm run deploy` : build puis déploiement sur Cloudflare Workers via wrangler (assets statiques de `dist/`, config dans `wrangler.jsonc`).

## Langue
- Code et noms de variables en anglais ; commentaires, messages de commit et échanges en français.
