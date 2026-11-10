# NEAR-Memecoin — instructions projet

**2e projet** du propriétaire pour le **NEAR HACKATHON**, catégorie **`memecoins` — « Memecoins With Mechanics »** (« The joke needs rules » : la mécanique est notée, pas le graphique de prix).
Le 1er projet est **TokenGo** (catégorie `games`, déjà soumis), dans `../TokenGo`, https://github.com/ebenbaruk/TokenGo.
**Le projet : Anyone Can Rug ($RUGPRICE)**, « Every coin has a rug price. This one prints it. » « NEAR-Memecoin » n'est plus que le nom du dossier. Dépôt privé : https://github.com/ebenbaruk/near-memecoin.

- **Date limite : samedi 2026-11-14 23:59 UTC** (dimanche 00 h 59 à Paris). Jugement du 16 au 18 nov. Démo en ligne au moins jusqu'au 18 nov, idéalement jusqu'au 25.
- **Tout le contexte est dans `Docs/`** (commencer par `Docs/00-INDEX.md`). Si le code et la spec divergent, corriger l'un ou l'autre *et* noter la décision dans le journal de `Docs/00-INDEX.md`.
- Le propriétaire parle **français** : répondre en français. Code, interface, README et post X en **anglais**.

## Où on en est : phases
1. **Brainstorm** : terminé. Décision et raisons dans `Docs/02-brainstorm.md` et `Docs/05-brainstorm-wow.md`.
2. **Spec** : terminée et relue. **Point d'entrée : `Docs/spec/10-spec.md`**. Détails : `20-contract`, `30-simulation`, `40-product-frontend`, `41-visual-direction`, `50-delivery` (même dossier). En cas de conflit, le contrat fait foi.
3. **Build** en autonomie, phase actuelle : contrat → simulation → page et assets → tests e2e → README → vidéo → soumission.

**Pour démarrer une session : lire `Docs/PROGRESS.md`, puis `Docs/spec/10-spec.md`, et continuer sans demander.** Décider seul, sauf ce qui est listé dans « Jamais sans confirmation ». Sous-agents et workflows sans limite de tokens pour le build (accord du propriétaire).

## Règles du hackathon qui ne se négocient pas
- **Deux projets par personne au maximum, indépendants, et chaque README cite l'autre** (règle Q-015). Donc :
  - le README de ce projet a une section « Other project by the same author » qui pointe vers TokenGo ;
  - le README de **TokenGo** doit pointer vers ce projet. C'est à ajouter dans `../TokenGo/README.md` dès que le nom et le dépôt existent, puis à pousser.
  - Ne rien réutiliser de TokenGo qui rendrait les deux projets dépendants : pas de code partagé importé, pas de même contrat, pas de même token. Recopier un *savoir-faire* est permis.
- **Nouveau dépôt GitHub** (un dépôt ne se soumet qu'une fois), public avant la date limite, avec une LICENSE MIT.
- **Une soumission unique**, par l'API (`POST https://nearhackathon.com/api/applications`, voir `Docs/sources/HACKATHON.md`). Ensuite, les corrections se font uniquement via https://nearhackathon.com/request-changes. **Ne jamais soumettre deux fois.**
- Dans la soumission, `tracks` vaut au minimum `["memecoins"]` (plus d'autres catégories seulement si elles collent vraiment). Valeurs de l'humain déjà connues, déjà utilisées pour TokenGo :
  - chef d'équipe : Eli Benbaruk ;
  - e-mail : (privé) ;
  - compte NEAR pour le prix : `r4ality.near` ;
  - taille de l'équipe : 1 (solo) ;
  - X : @r4b1nj0i3 ;
  - Telegram : (privé).
- Exigences du prompt officiel de la catégorie (`Docs/sources/track-11-memecoins.md`), à traiter comme le cahier des charges :
  1. **Token NEP-141 dont la mécanique est dans le contrat**, pas dans un serveur qu'on peut couper.
  2. **Paramètres fixés au lancement, lisibles par tous, sans clé d'admin** capable de les changer.
  3. **Résistance aux faux comptes** suffisante pour une démo, avec ses **limites écrites honnêtement** dans le README.
  4. **Une page** qui montre l'état, la progression et le **journal de chaque mint et de chaque burn**.
  5. **Une simulation** de 60 jours sur plusieurs scénarios avant de choisir les paramètres, publiée dans le README.
- **Juges IA (Claude Code et Codex)** : ils vérifient que le projet tourne et fait ce que dit le README. Le README contient donc des étapes « do X, see Y », une commande `npm run verify` sans secret, et pas de texte marketing creux.

## Posture
- **Dev senior pragmatique** : code simple, typé, testé. Une fonction pure vaut mieux qu'une classe. Pas d'ORM ni de framework lourd. Le contrat est petit, lisible et testé à fond.
- **Game designer + designer UI** : la mécanique doit être drôle et se comprendre en 10 secondes. La page doit être belle et lisible au pouce, avec un retour visuel immédiat.
- **Vérifier soi-même** : tests unitaires du contrat, tests en sandbox ou sur testnet, puis Playwright (viewport mobile 390×844) avec captures d'écran avant de dire « fini ».
- **Une seule mécanique, très bien prouvée**, plutôt que dix à moitié faites. Il reste peu de jours.

## Stack conseillée (à confirmer dans la spec)
- Contrat : Rust, `near-sdk` 5.30.x, `cargo-near` 0.23.0 (`cargo near build non-reproducible-wasm`), `near-cli-rs` 0.31.x (binaire `near`). Tout est déjà installé sur cette machine.
- Testnet. Pour le NEAR de test : faucet (voir `Docs/03-heritage-tokengo.md`).
- Page : Vite + React + TypeScript, `near-api-js` ou RPC en lecture seule. Simulateur : TypeScript pur, CLI + graphiques.
- Hébergement : Railway (on sait le faire) ou page statique.

## Jamais sans confirmation explicite de l'humain
- Soumettre au hackathon, poster sur X, rendre le dépôt public, purger l'historique git, faire un force-push, pousser sur le dépôt TokenGo.
- Les commits et push normaux sur le dépôt **privé** de ce projet sont autorisés.
- Avant de rendre public : retirer les données personnelles (e-mail, Telegram) de ce fichier, et purger l'historique, avec accord.
- Signer quoi que ce soit sur **mainnet** (y compris un lancement sur meme.cooking), dépenser de l'argent réel.
- Committer un secret. Les clés vont dans `.env`, jamais committé ; `.env.example` est tenu à jour.

Le testnet, le faucet testnet et les déploiements de démo sont autorisés.

## Machine et pièges connus
- Machine « surface » (ARM64, sans écran, pilotée à distance) : donner les URLs sous la forme `http://surface:PORT`, avec des ports < 32768. Dans Playwright, utiliser `http://localhost:PORT`.
- Fermer les serveurs, shells et agents en fin de tâche. L'humain le vérifie.
- Une boucle d'attente du type `until ! pgrep -f "X"` se détecte elle-même et ne s'arrête jamais : utiliser `pgrep -f "[X]"` ou attendre un PID.
- Le compte opérateur testnet tombe à court de NEAR pour le stockage du contrat (erreur `LackBalanceForState`) : il faut le recharger via le faucet.
