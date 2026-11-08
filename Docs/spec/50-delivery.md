# 50. Livraison : dépôt, tests, démo, vidéo, README, soumission

Écrit le 2026-11-08. Règles relues en ligne ce jour : `https://nearhackathon.com/HACKATHON.md` est identique à `sources/HACKATHON.md` ; aucune durée de vidéo n'est imposée. **À relire le 14 nov avant `--send`.**
Le contrat (`20-contract.md`) fait foi pour les méthodes et paramètres, `41-visual-direction.md` pour le visuel. Les valeurs entre `{}` viennent de la chaîne ou de `summary.json`.

## 1. Dépôt

```
contracts/anyone-can-rug/   crate Rust NEP-141 + mécanique ; res/anyone_can_rug.wasm + .sha256 committés
deploy/        live.json, fast.json (init canonique)
sim/           règles en TS pur (BigInt), CLI 60 jours, scénarios, graphiques → docs-assets/sim/
fixtures/      vectors.json (généré par sim, rejoué par contracts/anyone-can-rug/ et sim/)
web/           Vite + React + TS ; lit la chaîne par RPC depuis le navigateur, sans backend de lecture
bots/          bots de démo (voir §4)
e2e/           Playwright 390×844 ; e2e-prod/ pour l'URL publique
scripts/       verify.ts, check-secrets.ts, collect-shots.ts, submit.ts, try-testnet.ts, video/
docs-assets/   shots/, sim/, video/
var/           ignoré par git : submission.json, request-id, bruts vidéo
```
Workspaces npm : `sim`, `web`, `bots`. **Aucune dépendance, import ou chemin vers `../TokenGo`** ; on réécrit, on n'importe pas. `.gitignore` reprend `.env`, `var/`, `target/`, `node_modules/`, `dist/`, `test-results/`, `.playwright-mcp/`.

| Script npm | Fait | Secrets |
|---|---|---|
| `verify` | Voir ci-dessous. Moins de 5 min sur une machine normale | aucun |
| `sim` | Pipeline complet (voir 30 §8) : tableaux + PNG, déterministe ; `-- --quick` en quelques secondes | aucun |
| `test` | Vitest + `cargo test` | aucun |
| `e2e` / `e2e:prod` | Playwright sur fixtures / sur l'URL publique | aucun |
| `shots` | e2e puis copie dans `docs-assets/shots/` | aucun |
| `check:secrets` | Fichiers suivis + `git log -p --all` : `ed25519:` long, `BEGIN PRIVATE KEY`, `seed_phrase` ; échoue si `.env` est suivi | aucun |
| `try:testnet` | Compte jetable au faucet, achat, vente, puis achat + rug sur l'instance `fast`, liens explorateur, suppression du compte | aucun |
| `web` / `snapshot` | Serveur de la page / copie figée du journal (`web/public/snapshots/`) | aucun |
| `bots` / `video` | Boucle des bots / pipeline vidéo | `.env` / aucun |

**`npm run verify`** affiche un tableau `PASS / FAIL / SKIP`, sort en erreur sur tout FAIL, et n'affiche jamais « verified » s'il y a un SKIP sans le dire :
1. typecheck + tests unitaires TS ; 2. tests unitaires Rust (SKIP visible si `cargo` est absent) ; 3. vecteurs sim-contrat, relance de la génération et diff nul ; 4. build de la page ; 5. e2e smoke sur fixtures ; 6. **lecture seule sur testnet (RPC public)** : les vérifications de `20-contract.md` §15 sur les deux instances, requêtes épinglées à un seul bloc final. Sans réseau : SKIP visible, pas PASS ; 7. `sim --quick`.

Limite à écrire dans le README : `non-reproducible-wasm` ne garantit pas qu'un rebuild redonne le même hash. La preuve porte sur le binaire committé. Build reproductible (Docker) : seulement s'il reste du temps.

`verify` prouve les clés, le hash et la cohérence comptable du passé ; pas le comportement futur, ni que le source correspond au wasm : le README le dit, et renvoie aux tests et à `try:testnet`.

**CI GitHub Actions** : oui, un seul job sans secret sur `push` : `npm ci`, `check:secrets`, `verify` avec Rust. Playwright y reste en smoke. Si la CI résiste plus de 30 min, on la coupe : `verify` local suffit.

## 2. Comptes, fonds, clés

| Compte testnet | Rôle | Clés |
|---|---|---|
| `anyonecanrug.testnet` | Contrat instance `live` | **Aucune** après verrouillage |
| `rugfast.acr-ops.testnet` | Contrat instance `fast` | **Aucune** après verrouillage |
| `film.acr-ops.testnet` | Contrat de tournage, même wasm | **Aucune** après le tournage, sinon la vidéo ne peut pas dire « zero keys » |
| `acr-ops.testnet` | Déploie, finance ; `rc1.acr-ops.testnet`, etc. pour les répétitions | Pleine, `.env` |
| `*.acr-bots.testnet` | Bots | Pleine, env Railway ; aucun pouvoir sur le contrat |

- Une clé `FunctionCall` ne peut pas attacher de dépôt : acheter ou appeler `ft_transfer` (1 yocto) demande une clé pleine. L'absence de clé pleine ne vaut donc que pour le contrat. Les bots sont des joueurs ordinaires, avec de petits soldes.
- Fonds : faucet `helper.nearprotocol.com/account` (10 NEAR par compte jetable, `deleteAccount` vers l'opérateur), reprise du savoir-faire TokenGo. Limite de débit possible : financer dès le 9 nov, viser 150 NEAR sur l'opérateur.
- Secrets : `.env` seulement, chargé par dotenv, jamais affiché ni passé en argument de ligne de commande. `.env.example` à jour : `NEAR_NETWORK`, `NEAR_RPC_URL=https://test.rpc.fastnear.com`, `LIVE_CONTRACT_ID`, `FAST_CONTRACT_ID`, `OPERATOR_ID`, `OPERATOR_KEY`, `BOT_ACCOUNTS`, `BOT_KEYS`, `BOTS_ENABLED`, `VITE_RPC_URL`, `SUBMIT_EMAIL` (lu à la soumission, jamais committé) ; les instances sont dans `web/public/instances.json`.
- **Données personnelles** : l'historique du dépôt contient l'e-mail et le Telegram de l'humain (`CLAUDE.md`, versions passées de `Docs/`). Avant le passage en public, les retirer et purger l'historique avec `git filter-repo --replace-text` ; le force-push correspondant fait partie du même accord (§9).

## 3. Déploiement et verrouillage

1. Répétition complète sur `rc1.acr-ops.testnet` : déploiement, init, smoke.
2. **Gel des paramètres** le 10 nov au soir, après simulation.
3. Le 12 nov : créer le compte final, déployer et initialiser dans la même transaction (`with-init-call`), avec le wasm committé. Syntaxe `near` à vérifier sur la 0.31 (`--help`).
4. Smoke testnet complet sur le compte final.
5. **Supprimer toutes les clés du compte contrat** (`view_access_key_list`, puis suppression clé par clé). Relire : la liste doit être vide. Relancer le smoke.
6. Consigner dans le README : hash de la transaction de déploiement et de chaque suppression de clé.

Le verrouillage est **irréversible**. Bug après coup : nouveau compte (`anyonecanrug-v2.testnet`), mise à jour de `instances.json` et du README, déclaré dans le README. Pas de procédure de mise à jour, c'est le principe.
`LackBalanceForState` : un virement simple reste possible vers un compte sans clé. Le contrat se recharge donc sans clé, et les bots surveillent la marge de stockage.

**Hébergement** : Railway, un service Dockerfile sans `VOLUME`, `startCommand` dans `railway.json`, domaine public généré, `/healthz`. Un process Node sert `web/dist` et lance les bots en **processus enfant** : si les bots plantent, la page reste debout, et `/healthz` reste 200. La page lit le RPC directement, donc **la mécanique et la lecture fonctionnent sans notre serveur**. Repli si Railway tombe : `npm run web` (Q-012 admet le local avec vidéo).

## 4. Bots de démo

**Pourquoi** : sans bot attentif, 90 % des parties simulées ne voient aucun rug. Une démo sans foule resterait morte pendant le jugement.

- **Fonctionnement** : boucle Node avec RNG à graine, 4 à 6 profils (acheteur, vendeur, accumulateur, rugger). Ils n'appellent que les méthodes publiques. Une action toutes les 5 à 10 min.
- **Cadence des rugs** : le rugger n'agit que si le prix public le permet. Objectif : au moins un rug visible dans le journal des dernières 24 h du 16 au 18 nov, et un tour ouvert à tout moment.
- **Étiquetage** : badge `BOT` dérivé du suffixe `.acr-bots.testnet`, donc vérifiable, jamais d'une liste côté serveur. La page affiche `humans / bots` séparément. Le README et la vidéo disent que l'activité de démo vient de bots, et que le tournage utilise une instance dédiée ; le rug filmé est celui d'un compte jetable, via `Try it, no wallet`. Aucun chiffre de bots présenté comme une communauté.
- **Budget (estimation à mesurer le 12 nov)** : environ 200 tx/jour × 17 jours, ordre de 10 NEAR de gaz ; 60 à 100 NEAR de trésorerie qui tourne. Bot sous 2 NEAR : il s'arrête proprement et le signale.
- **Durée** : obligatoire jusqu'au 18 nov 23:59 UTC, objectif 25 nov. Ensuite, `BOTS_ENABLED=0` ; le contrat, lui, reste.
- **Surveillance** : timer utilisateur sur `surface` toutes les 15 min, qui lit la dernière action de bot par RPC et appelle `surface-notify` (Telegram) après 60 min de silence, ou si le solde ou `/healthz` pose problème. À fermer après le 25 nov.
- **Si les bots meurent** : rien ne se casse. La page affiche « Demo bots offline since X, the contract still works », les tours restent ouverts, et `verify` passe toujours (il ne dépend pas de l'activité récente). Relance : redéploiement Railway, ou repli `npm run bots` sur `surface` avec le même `.env`. Jamais deux instances à la fois (nonces).

## 5. Matrice de tests

| Niveau | Couvre | Outil | Quand |
|---|---|---|---|
| Unitaire contrat | NEP-141 ; achat, vente, frais ; `rug` (seuil, `min_payout`, tour périmé, cagnotte minimale) ; arrondis, débordements, rentrance ; **absence de méthode privilégiée** | `cargo test`, `testing_env!` | chaque commit |
| Unitaire TS | Règles, scénarios (graine fixe), formatage, parsing du journal | Vitest | chaque commit |
| Vecteurs sim-contrat | Suites achat/vente/rug avec états attendus en yocto, générées par TS, **rejouées par Rust** : deux implémentations indépendantes | `vectors.json` | chaque commit |
| Sandbox | Promesses, callbacks, remboursements, dépôts, parcours multi-comptes, 20 vecteurs rejoués | `near-workspaces` **si ça tourne sur ARM64** | contrat modifié |
| Testnet smoke | Script sur `rc1` puis final : achat, vente, rug, `min_payout` refusé, journal, liens explorateur | `scripts/`, `try:testnet` | avant et après verrouillage |
| E2E 390×844 | Tous les écrans et états ci-dessous, RPC simulé par `page.route` avec des réponses **capturées du vrai testnet** | Playwright | chaque changement de page |
| E2E prod | URL publique, vraie chaîne, lecture seule | `e2e:prod` | 12, 13, 14 nov puis 16 nov |

**Porte ARM64 (9 nov, 30 min max)** : TokenGo n'a jamais essayé `near-workspaces` ici. Si ça échoue, le niveau sandbox est remplacé par le smoke testnet sur `rc*`, et le README le dit.

**Écrans et états** (à aligner sur la spec page) :

| Écran | États à capturer |
|---|---|
| Accueil / cagnotte / prix du rug | chargement, nominal, cagnotte sous le minimum, rug possible, juste après un rug (animation + nouveau tour), RPC en erreur, données périmées, bots hors ligne |
| Achat / vente | vide, montant invalide, solde insuffisant, tx en cours, succès, rejet |
| Confirmation du rug | déconnecté, tokens insuffisants, prêt, `min_payout` dépassé, tour périmé, tx en cours, succès |
| Journal mint/burn | vide, rempli, badge BOT, lien explorateur, pagination |
| Règles / paramètres | valeurs lues sur la chaîne, « zero keys », limites sybil |
| Simulation | scénarios, graphique lisible au pouce |
| Portefeuille | non connecté, connexion, connecté, déconnexion |

**Assertions communes** : aucun `console.error`, aucun `pageerror`, aucune requête en échec (liste d'exceptions vide par défaut) ; `scrollWidth <= 390` ; cibles tactiles ≥ 44 px ; horloge et graine fixes.
**Revue des captures** : ouvrir **chaque PNG** et cocher texte coupé, chevauchement, contraste, chiffres incohérents, badge BOT présent. Une assertion verte ne remplace pas cette lecture.
**Lacune connue** : le navigateur de test n'a pas de portefeuille. Essayer le parcours de signature testnet réel dans Playwright ; si impossible, signataire simulé en e2e, tx réelles couvertes par le smoke, et limite écrite dans le README.

**Definition of done**
- [ ] `npm ci && npm run verify` passe depuis un **clone neuf**, sans `.env`, sans FAIL.
- [ ] Contrat final : 0 clé, hash égal, paramètres égaux au README.
- [ ] Les 5 exigences du prompt de la catégorie sont démontrables, chacune avec une étape « do X, see Y ».
- [ ] Simulation 60 jours publiée, plusieurs scénarios, y compris les mauvais.
- [ ] Toutes les captures relues, zéro erreur console, e2e prod vert.
- [ ] Bots actifs depuis 24 h ou plus, au moins un rug réel dans le journal.
- [ ] Chaque étape du README exécutée telle quelle ; tous les liens ouverts.
- [ ] Vidéo relue image par image aux changements de plan.
- [ ] `check:secrets` vert ; aucun serveur, shell ou agent laissé ouvert.
- [ ] Texte relu : ni « rug-proof », ni « guaranteed floor », ni rendement simulé présenté comme attendu.

## 6. Vidéo (cible 72 s, tolérance 60 à 90 s, master portrait)

Portrait d'abord (1080×1350) ; la version paysage met ce master en pilier avec le motif tissé sur les côtés. Chiffres et valeurs entre `{}` : remplis depuis `get_params` et le vrai journal au tournage. Environ 150 mots. Plans et images : voir 41.

| Temps | Image | Narration (anglais) | Légende |
|---|---|---|---|
| 0-3 | Plein écran : le tapis, la cagnotte dessous, la main saisit (0-1 s), tire (1-2 s) | "Every memecoin gets rugged. Usually by the team. This one prints the price." | ANYONE CAN STEAL THIS POT |
| 3-12 | La page, étiquette de prix, tas de NEAR | "Anyone Can Rug. There's a pot. There's a price. Pay it, and the pot is yours. No team. No permission." | STEAL THIS POT. |
| 12-22 | Trades, le tapis qui se soulève | "Every trade drops {fee} percent into the pot. Burn {tau} percent of the supply, and you take all of it. When the pot outgrows the price, the rug starts to lift." | {fee}% per trade → the pot. Burn {tau}% → take it. |
| 22-40 | **Un humain au centre** : `Try it, no wallet`, maintien, climax, `YOU RUGGED IT`, transaction réelle, affiche WANTED | "So let's steal it. No wallet. Hold. A real transaction on NEAR testnet, and your name on the wall, forever." | Real testnet tx |
| 40-50 | `0 keys` ; terminal `npm run verify` | "The rules live in the contract. We deleted every key on the account, so nobody can change them, not even the author. Check it yourself." | 0 access keys. Check it. |
| 50-62 | Simulation à 60 jours | "We simulated sixty days before fixing the parameters. Too cheap, and the pot goes instantly. Too expensive, and nobody ever steals it." | Bots and whales probably win. |
| 62-72 | Deuxième tentative, écran de course perdue : `Too slow. bot-3 rugged round 12 first.` (valeurs réelles du tournage), puis carte de fin | "Bots probably win. It's in the README." | Anyone Can Rug · Built at NEAR Hackathon |

Exporter aussi la dernière séquence en boucle de 6 s. Déclarer l'instance de tournage dans le README. Le script n'emploie jamais « I recorded ».

**Pipeline** (`npm run video`) :
1. `narration.json` → un fichier audio par plan ; la **durée du plan suit l'audio mesuré** (`ffprobe`). L'audio et les images sont produits hors du dépôt, dans un dossier jetable, et n'ajoutent aucune dépendance aux manifestes : seuls les fichiers finaux entrent dans le dépôt.
2. Tournage Playwright 390×844, `deviceScaleFactor` 2 à 3, repères `marks.json`, comme TokenGo. Source : `film.acr-ops.testnet`, **même wasm**, bots scriptés pour que la course perdue arrive sur commande.
3. Repli si le testnet ne suit pas : rejeu de réponses RPC capturées d'une vraie séquence, sans modifier les chiffres.
4. Habillage (cadre, cartes) en HTML capturé par Chromium ; légendes ASS (libass) avec polices du dépôt ; musique écrite par script, donc sans licence tierce.
5. ffmpeg : `libx264`, `yuv420p`, 30 fps, AAC, `+faststart`, `loudnorm` à -16 LUFS, musique abaissée sous la narration.
6. Sorties dans `docs-assets/video/` : `rug-demo-portrait.mp4` 1080×1350, `rug-demo.mp4` 1920×1080 (pilier), `rug-loop.mp4`, `thumbnail.png` 1280×720. Moins de 140 s et 512 Mo pour X.
7. Contrôle : durée entre 60 et 90 s, une image extraite par plan et relue, `silencedetect`, légendes dans la zone sûre.

## 7. README (anglais, pour lecteurs machine et humains)

Pas de marketing. Ordre :
1. Titre, une phrase, liens : démo, contrat, explorateur, vidéo, post X.
2. **The mechanic in 10 seconds.**
3. **Judge it in 5 minutes**, étapes « do X, see Y » :
   - `npm ci && npm run verify` → tableau PASS, sans secret.
   - `near` ou RPC `view_access_key_list` sur le contrat → liste vide.
   - Ouvrir la démo → cagnotte, prix du rug, journal de chaque mint et burn, badges BOT.
   - Ouvrir un lien de rug du journal → burn et paiement sur l'explorateur.
   - `npm run try:testnet` → un compte jetable achète, vend, puis rugue l'instance `fast`, liens imprimés.
   - `npm run sim -- --quick` → smoke en quelques secondes ; `npm run sim` → les tableaux du README, à l'identique.
4. Exigences de la catégorie → preuve (tableau à 5 lignes).
5. Contrat : méthodes, paramètres, déploiement, tx de suppression des clés.
6. Simulation : scénarios, graphiques, zone viable de τ/f, **hypothèses de comportement**.
7. **Limits, honestly** : sybil, baleines, bots probablement gagnants et parties sans rug (chiffres lus dans `summary.json`), déviation NEP-145 (`storage_unregister` panique toujours), portée réelle de `verify`, testnet, hash non reproductible, ce qui n'a pas été testé.
8. Architecture (mermaid), tableau des tests, exécution locale.
9. **Other project by the same author** : *"[TokenGo](https://github.com/ebenbaruk/TokenGo) (track: games), also by Eli Benbaruk. The two projects are independent: no shared code, contract or token."*
10. **Hackathon disclosure (Q-005)** : code écrit depuis le 2026-11-08 et aucune base antérieure ; **code, tests, docs principalement générés avec Claude Code** sous la direction du développeur solo ; `Docs/` publié ; **liste complète des bibliothèques** : near-sdk, cargo-near, React, Vite, near-api-js, Playwright, Vitest, ffmpeg, etc., recalculée depuis les manifestes le 13 nov.
11. License : MIT, avec fichier `LICENSE` à la racine, copyright 2026 Eli Benbaruk.

**Miroir TokenGo (Q-015)** : dans `../TokenGo/README.md`, ajouter avant `## License` : *"## Other project by the same author — [Anyone Can Rug](REPO_URL) (track: memecoins), independent of TokenGo: no shared code, contract or token."* Commit isolé, sans toucher au tag `hackathon-submission-v2`.

## 8. Post X et soumission

**Post** (≤ 280, recompté par `submit.ts`, une URL comptant 23) ; c'est l'humain qui publie, avec la vidéo :
> Every memecoin can be rugged. Usually by the team.
> $RUGPRICE prints the price: burn what the page says, take the whole pot. Zero admin keys.
> Built at NEAR HACKATHON on testnet. @NEARProtocol #NEARHackathon
> Can you beat the bots? {DEMO_URL}

Lien du dépôt en réponse au post, et dans le README.

**Tracks : `["memecoins"]` uniquement.** C'est la seule catégorie qui colle vraiment. `games` note la boucle de jeu, et TokenGo y est déjà ; `defi` et `agents` visent Intents ou des agents autonomes, nos bots ne sont que des figurants ; `open` est pour ce qui ne rentre nulle part. Cocher plus serait de l'opportunisme.

**Charge utile** (`var/submission.json`, jamais committé) : `requestId` généré une fois et conservé dans `var/` ; `projectName: "Anyone Can Rug"` ; `leadName: "Eli Benbaruk"` ; `email` lu dans `SUBMIT_EMAIL` (`.env`, jamais committé) ; `size: "1"` ; `tracks: ["memecoins"]` ; `nearAddress: "r4ality.near"` ; `projectUrl` ; `demoUrl` : le post X ; `idea` (20 à 2000 car.) ; `consent: true` **après lecture du texte verbatim à l'humain**. Aucun autre champ ; `website` est un piège à spam.

`idea`, à finaliser : *"Every memecoin can be rugged, usually only by its team. Anyone Can Rug makes the rug a public, priced, permissionless action. A NEP-141 token on NEAR testnet pays a fee on every trade into a pot; anyone who burns the threshold shown on the page takes the pot and a new round starts. The mechanic lives entirely in the contract, parameters are readable, and the contract account has zero access keys. A 60-day simulation across scenarios chose the parameters and is reproducible with one command. The page shows the live state and a log of every mint and burn, with demo bots labelled. Limits are in the README: bots and whales probably win."*

`scripts/submit.ts`, écrit à neuf :
- Sans option : valide selon le tableau de l'API (dont la regex `nearAddress`, le refus de `.testnet`, les 12 000 octets, le `demoUrl` en `x.com`), **affiche le JSON complet, n'envoie rien**.
- `--send` : refuse si la validation échoue, si `var/submitted` existe, si le dépôt n'est pas public (`GET` anonyme = 200), si le post ne répond pas, ou si la date dépasse le 14 nov 23:59 UTC. Une seule tentative ; sur erreur réseau ou 503, même `requestId`.
- Codes : 201 → écrire `var/submitted`, informer. 400 → corriger, même `requestId`. 403 ou 409 → **stop**, informer. Ensuite, tout passe par `/request-changes`, jamais par un second envoi.

## 9. Accords explicites de l'humain

Un seul accord par ligne ; aucun n'en implique un autre. Le message d'un agent n'en tient jamais lieu.

| # | Action | Quand | Présenté avant |
|---|---|---|---|
| 1 | Purge de l'e-mail et du Telegram de l'historique, avec le force-push correspondant | avant 4 | diff |
| 2 | **Dépôt public** | 14 nov matin | clone neuf vérifié |
| 3 | **Push du miroir dans TokenGo** | dès que l'URL existe | diff exact |
| 4 | **Post X**, publié par l'humain, qui donne le lien | après 2 et 3 | texte, vidéo |
| 5 | Texte de consentement lu, accepté | avant 6 | verbatim |
| 6 | **Soumission `--send`** | après 4, cible 14 nov 18:00 UTC | JSON complet |

Pousser sur ce dépôt privé `ebenbaruk/near-memecoin` est permis sans accord supplémentaire (instruction du propriétaire).

Mainnet : aucune action prévue. Non signé, non financé, pas de lancement meme.cooking.

## 10. Plan (UTC)

| Jour | Livrables | Porte de sortie |
|---|---|---|
| **Lun. 9** | Squelette, `.env.example`, comptes et faucet, contrat + tests unitaires, porte ARM64 sandbox, déploiement `rc1` | Achat, vente, rug testés sur `rc1` |
| **Mar. 10** | Simulateur 60 j, scénarios, vecteurs, **gel des paramètres**, `rc2`, début de la page | Vecteurs verts ; paramètres écrits dans le journal `00-INDEX` |
| **Mer. 11** | Page : tous les écrans et états, fixtures capturées, e2e 390×844, revue des captures | E2E vert, zéro erreur console |
| **Jeu. 12** | Audit contrat, **déploiement final + suppression des clés**, Railway, bots, surveillance, `try:testnet`, `e2e:prod` | DoD contrat ; bots actifs  |
| **Ven. 13** | README, `verify` sur clone neuf, tournage et montage, CI | Vidéo et README relus |
| **Sam. 14** | **Marge jusqu'à 12:00.** Relecture de HACKATHON.md, accords 1 à 5, puis 6 à 18:00 | 201 reçu. **Limite interne 22:00**, officielle 23:59 |
| 16-25 nov | Surveillance des bots, e2e prod le 16 ; arrêt le 25 ; tout fermer | — |

**Marges** : environ 3 h le mercredi soir, 3 h le vendredi soir, la matinée de samedi. Si un jour glisse de plus d'une demi-journée, appliquer la coupe suivante.

**Ordre des coupes** (d'abord le moins grave) :
1. Build reproductible Docker. 2. CI. 3. Boucle GIF, animations, version portrait soignée. 4. Narration (→ légendes seules). 5. Sandbox (→ smoke testnet). 6. `try:testnet` (→ étapes manuelles). 7. Signature portefeuille en Playwright (→ limite écrite). 8. Animations de la page.

**Jamais coupés** : tests du contrat, vecteurs, simulation à 60 jours, journal de chaque mint et burn, 0 clé, badges BOT, section Limits, section TokenGo et son miroir, vidéo (même sans narration), `verify`, `check:secrets`.
