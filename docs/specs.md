# Traverser — Spécifications du prototype

> Nom de travail : **Traverser** (alt. *Qua Đường*, « traverser la rue » en vietnamien).
> Objectif du proto : vérifier en une soirée de jeu si **la sensation centrale fonctionne**.

---

## 1. Vision

À Hanoï, pour traverser une rue saturée de scooters, on ne court pas et on ne s'arrête pas : on avance d'un pas **lent et régulier**, et le flux s'écarte autour de soi. Les conducteurs anticipent la trajectoire du piéton ; c'est l'hésitation qui provoque l'accident.

**Pilier unique du jeu : la constance est la sécurité, l'hésitation est le danger.**

C'est l'inverse de *Frogger* : on ne cherche pas un trou dans le trafic, on fait confiance au trafic. Le joueur doit lutter contre son propre réflexe de s'arrêter quand un scooter fonce sur lui.

---

## 2. Périmètre du proto

### Inclus
- Une seule rue vue de dessus, en mode portrait, traversée de bas en haut puis de haut en bas (allers-retours).
- Un flux de scooters dans **un seul sens** (gauche → droite) ; un paramètre permet d'activer le double sens pour test.
- Piéton contrôlé au doigt (cf. §4).
- IA d'évitement prédictif des scooters (cf. §5) — **le cœur du proto**.
- Collision = fin de partie.
- Score = nombre de traversées réussies ; meilleur score sauvegardé localement.
- Densité qui augmente toutes les 20 s.
- Panneau de debug pour régler l'IA en direct.

### Exclus (pour plus tard)
- Jauge de sang-froid, véhicules « qui ne jouent pas le jeu » (bus, taxi, livreur distrait), pluie/nuit, quartiers/niveaux, étoiles, sons élaborés, menus complets, sauvegarde de progression, PWA, Capacitor.

---

## 3. Stack et contraintes techniques

- **Vite + TypeScript**, sans framework UI.
- Rendu **Canvas 2D** plein écran, mise à l'échelle `devicePixelRatio`.
- Cible : **Safari iPhone** en portrait. Doit tourner à 60 fps avec ~80 scooters.
- Entrées : Pointer Events (`pointerdown/move/up/cancel`), `touch-action: none`, pas de zoom, pas de sélection de texte, pas de scroll élastique.
- Boucle de jeu à **pas de temps fixe** (ex. 1/120 s) avec rendu interpolé : l'IA doit être déterministe vis-à-vis du framerate.
- Monde en **unités logiques** (mètres) indépendantes de la taille d'écran ; une caméra convertit en pixels.
- Tous les paramètres réglables regroupés dans `src/config.ts`.
- `localStorage` uniquement pour le meilleur score, encapsulé dans un `try/catch`.
- Déploiement : Cloudflare Pages (comme les autres projets).

### Arborescence suggérée
```
src/
  main.ts          // bootstrap, resize, boucle
  config.ts        // tous les paramètres
  game.ts          // état de partie, score, densité, game over
  input.ts         // gestion du doigt
  pedestrian.ts    // modèle du piéton
  scooter.ts       // modèle + IA d'un scooter
  traffic.ts       // spawn, densité, séparation entre scooters
  render.ts        // dessin
  debug.ts         // panneau de debug (?debug=1)
```

---

## 4. Le piéton

### Contrôles
| Geste | Effet |
|---|---|
| Doigt posé (n'importe où) | Le piéton avance vers le trottoir opposé à `walkSpeed` |
| Doigt levé | Le piéton s'arrête |
| Glisser horizontal du doigt (pendant l'appui) | Légère dérive latérale, proportionnelle au déplacement du doigt, plafonnée à `lateralMaxSpeed` |

- Accélération et freinage **doux mais rapides** (`pedAccel`, ~0,25 s pour atteindre `walkSpeed`) : on doit sentir le pas, pas une glissade.
- Pas de marche arrière dans le proto.
- Sur le trottoir, le piéton est en sécurité. Arrivé sur le trottoir opposé → **+1 traversée**, il se retourne automatiquement ; il faut relever puis reposer le doigt pour repartir.

### Valeurs de départ
- `walkSpeed` = 1,3 m/s · `pedRadius` = 0,3 m · `lateralMaxSpeed` = 0,6 m/s
- Largeur de rue : 4 voies informelles, ~12 m.

---

## 5. Les scooters et l'IA d'évitement (cœur du proto)

### 5.1 Comportement de base
- Spawn hors écran à gauche, avancent vers la droite à une vitesse propre tirée au hasard (`scooterSpeed` 6–9 m/s).
- Position verticale de « confort » tirée au hasard dans la largeur de la rue (pas de voies strictes, flux en essaim).
- **Séparation** simple avec les scooters voisins (répulsion douce) pour éviter qu'ils se chevauchent.
- Rappel doux vers leur position verticale de confort quand rien ne les gêne.
- Despawn hors écran à droite.

### 5.2 Perception du piéton (la clé)
Un scooter **ne voit pas la vitesse instantanée** du piéton. Il perçoit une **vitesse lissée** avec retard :

```
vPerçue = EMA(vitessePiéton, constante de temps = perceptionLag)   // ~0,4 s
```

Conséquence voulue :
- Piéton à vitesse constante → vitesse perçue = vitesse réelle → prédictions justes → évitement parfait.
- Piéton qui s'arrête brusquement → les scooters « croient » encore qu'il avance → ils visent l'endroit où il *aurait dû* être, c'est-à-dire là où il est maintenant → **collision**.
- Piéton qui repart brusquement → même problème dans l'autre sens.

Chaque scooter ne réagit au piéton qu'en dessous d'une distance `awarenessRange` (~15 m devant lui).

### 5.3 Prédiction et décision
À chaque pas de décision (pas forcément à chaque tick, ex. toutes les 0,1 s) :
1. Prédire la position du piéton sur un horizon `predictionHorizon` (~1,5 s) avec `positionActuelle + vPerçue × t`.
2. Calculer le **point d'approche minimale** entre la trajectoire du scooter et celle prédite du piéton.
3. Si la distance minimale prédite < `safeDistance` (~1,2 m) : choisir un **côté de contournement** :
   - **Passer derrière** le piéton (côté d'où il vient), ou
   - **Passer devant** (côté où il va).
   Choisir le côté qui demande le moins de déviation par rapport à la trajectoire prédite. En cas de quasi-égalité, préférer *derrière* (comportement réaliste).
4. Le scooter **s'engage** sur ce côté pendant `commitTime` (~0,6 s) : il ne change pas d'avis pendant ce temps, sauf urgence absolue (distance réelle < `panicDistance`).
5. Pour exécuter : déviation verticale vers le côté choisi (vitesse latérale plafonnée `steerMax`) + léger ralentissement si nécessaire (`brakeMax`, jamais l'arrêt complet).

L'engagement (`commitTime`) combiné au retard de perception (`perceptionLag`) est ce qui rend l'hésitation punitive. **Ce sont les deux paramètres principaux à régler.**

### 5.4 Valeurs de départ (toutes dans `config.ts`)
| Paramètre | Valeur | Rôle |
|---|---|---|
| `perceptionLag` | 0,4 s | Retard de lecture de la vitesse du piéton |
| `predictionHorizon` | 1,5 s | Jusqu'où le scooter anticipe |
| `commitTime` | 0,6 s | Durée d'engagement sur un côté |
| `safeDistance` | 1,2 m | Distance d'écart visée |
| `panicDistance` | 0,6 m | Seuil de réévaluation d'urgence |
| `steerMax` | 2,5 m/s | Vitesse latérale max |
| `brakeMax` | 40 % | Ralentissement max |
| `awarenessRange` | 15 m | Distance de réaction |
| `scooterSpeed` | 6–9 m/s | Vitesse de croisière |

---

## 6. Collision, frôlements, fin de partie

- Piéton = cercle ; scooter = capsule (~1,8 m × 0,7 m).
- **Collision** → arrêt du temps (≈0,3 s), petit tremblement d'écran, puis écran de fin : traversées, meilleur score, « Toucher pour rejouer ».
- **Frôlement** (scooter passé à moins de 0,8 m sans contact) → petit effet visuel (trait de vent, flash léger). Pas d'impact sur le score dans le proto, mais compter les frôlements et les afficher en fin de partie : utile pour juger la tension.

---

## 7. Densité et progression

- La partie démarre avec un débit de `spawnRateStart` (~1,2 scooter/s).
- Toutes les **20 s**, le débit augmente de `spawnRateStep` (~+0,4 scooter/s), plafonné à `spawnRateMax` (~5 scooters/s).
- Les spawns ont une petite part d'aléatoire (rafales et creux), pour que le flux paraisse vivant et pas en grille.
- Afficher discrètement le « niveau de densité » courant (1, 2, 3…).

---

## 8. Rendu (proto, sobre mais lisible)

- Vue de dessus. Rue asphalte sombre chaud, trottoirs carrelés plus clairs en haut et en bas.
- Piéton : cercle avec un **nón lá** (chapeau conique) vu de dessus, ombre portée légère, petite oscillation de marche quand il avance.
- Scooters : rectangles arrondis de couleurs variées, phare avant, conducteur en point de couleur ; certains avec un passager ou un chargement (simple variation visuelle).
- Palette chaude (lanternes, ocre, vert d'eau), lisibilité avant tout : le piéton doit toujours ressortir.
- HUD minimal : traversées en haut, densité discrète.
- Son (optionnel en fin de proto) : klaxons courts synthétisés via WebAudio quand un scooter dévie, ambiance de fond.

---

## 9. Panneau de debug (`?debug=1`)

Indispensable pour régler la sensation :
- Afficher pour chaque scooter réactif : position prédite du piéton (point fantôme), côté choisi (flèche), engagement actif (couleur).
- Afficher la vitesse réelle vs perçue du piéton.
- Curseurs en direct pour tous les paramètres du §5.4 et du §7.
- Bouton « pause / pas à pas », bouton « invincible ».
- Compteur fps et nombre de scooters.

---

## 10. Étapes de développement

Chaque étape se termine par une validation sur iPhone avant de passer à la suivante.

1. **Fondations** — Vite + TS, canvas plein écran portrait, boucle à pas fixe, caméra en mètres, gestion du resize et du DPR, entrée tactile propre (pas de zoom/scroll). *Validation : un écran vide fluide, aucun geste parasite de Safari.*
2. **Piéton** — rue, trottoirs, piéton contrôlé au doigt, allers-retours, compteur de traversées. *Validation : le pas « se sent » bien.*
3. **Flux de scooters sans évitement** — spawn, vitesses, séparation, despawn, densité. *Validation : le flux paraît vivant, 60 fps à 80 scooters.*
4. **IA d'évitement + debug** — perception lissée, prédiction, choix du côté, engagement, panneau de debug. *Validation : en marchant régulièrement, on traverse sans jamais être touché à densité 1–2.*
5. **Collision, frôlements, fin de partie** — game over, meilleur score, rejouer. *Validation : s'arrêter au milieu provoque des accidents de façon compréhensible.*
6. **Courbe de densité** — paliers de 20 s, rafales. *Validation : une partie dure entre 1 et 4 min pour un joueur moyen.*
7. **Habillage léger** — nón lá, variations de scooters, frôlements, tremblement, sons optionnels.

---

## 11. Critères de réussite du proto

Le proto est réussi si, après 10 parties :
- Le joueur **comprend seul**, sans tutoriel écrit, qu'il ne faut pas s'arrêter (au besoin, une seule phrase à l'écran titre : « Ne t'arrête jamais. »).
- Les accidents paraissent **mérités** (« j'ai hésité ») et jamais injustes.
- Il y a un vrai moment de tension où le doigt « veut » se lever face à un scooter qui fonce.
- On a envie de relancer une partie.

Si les accidents paraissent aléatoires : d'abord rendre la déviation des scooters plus lisible (feedback visuel), puis réduire la densité, et seulement ensuite baisser `perceptionLag` ou `commitTime` (des valeurs trop hautes punissent la moindre micro-correction).
