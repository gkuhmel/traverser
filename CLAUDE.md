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

## Commandes et déploiement (tout en ligne, rien en local chez l'utilisateur)
- `npm run build` doit passer sans erreur TypeScript avant chaque fin d'étape (vérifié dans la session Claude Code).
- Déploiement automatique par Cloudflare Workers Builds, branché sur le dépôt GitHub :
  - commande de build : `npm run build` ;
  - commande de déploiement (branche de production) : `npx wrangler deploy` ;
  - branches de travail : `npx wrangler versions upload` → URL de préversion par branche.
- Pour tester sur iPhone : pousser sur la branche, attendre le build Cloudflare, ouvrir l'URL de préversion dans Safari (ajouter `?debug=1` si besoin).
- Config Worker (assets statiques de `dist/`) dans `wrangler.jsonc` ; le `name` doit correspondre au nom du Worker côté Cloudflare.

## Langue
- Code et noms de variables en anglais ; commentaires, messages de commit et échanges en français.
