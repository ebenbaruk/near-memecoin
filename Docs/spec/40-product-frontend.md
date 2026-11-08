# 40. Produit et front-end

L'habillage est défini par `41-visual-direction.md`, qui prévaut sur ce document pour tout ce qui est visuel. Le contrat (`20-contract.md`) prévaut pour les méthodes, champs et erreurs. Interface, copie et README en anglais ; ce document en français. Mesures réseau faites le 2026-11-08 depuis surface.

## 1. Nom et ticker

**Décision : Anyone Can Rug, ticker `$RUGPRICE`.** Secours : `$STEALME`, puis `$PRICEDIN`. Le ticker reprend la phrase d'accroche : « Every coin has a rug price. This one prints it. »

| Candidat | Collision constatée | Verdict |
|---|---|---|
| `$RUG` | Des dizaines sur Solana, Ethereum, Hyperliquid, **et sur NEAR même** (`rug.nearlytrade.near`, paire sur Rhea) | Écarté |
| `$ACR` | Acreage, AI Card Render, Arcona, un ACR sur Solana | Écarté |
| `$RUGPRICE` | Rien trouvé | **Choisi** |
| `$STEALME` | Pas d'exact ; `$STEAL` (Solana, très petit) | Secours 1 : plus clair pour un novice, moins lié à l'accroche |
| `$PRICEDIN` | Un `PRICEDIN` sur pump.fun, sans échange récent | Secours 2 |

« Anyone Can Rug » : aucun projet de ce nom trouvé. Voisins à connaître : Rug.fun, The Rug Game. Vérification par recherche web uniquement, donc non exhaustive. Comptes `anyonecanrug.testnet` et `rugprice.testnet` : libres à la date du test.

## 2. Copie produit (anglais, définitive)

Les nombres entre accolades viennent toujours du contrat, jamais du texte.

- **Au-dessus de la ligne de flottaison, 390×664 (figé) :** `STEAL THIS POT. {pot} NEAR.` puis `Anyone can. This is the price.`
- **Accroche secondaire :** `Every coin has a rug price. This one prints it.`
- **Les 3 lignes (dans le panneau juste sous le tapis) :**
  1. `Every trade drops {fee}% into the pot.`
  2. `Burn {burn_tokens} $RUGPRICE and the whole pot is yours.`
  3. `Anyone can. Right now. That's the coin.`
- **What's a "rug"? (dépliant sous les 3 lignes) :** `A "rug pull" is when the people behind a coin run off with the money. Here, nobody is behind it. There's a pot, and a printed price to steal it. Pay the price, take the pot. Everyone can see who's getting close, and everyone can beat them to it.`
- **What the rug takes :** `A rug takes the pot, not the curve's reserve. Selling stays open afterwards, at whatever the curve says then. Burned tokens are gone.`
- **The Gap (légende de la jauge) :** `The Gap: pot minus what it costs to steal it today.`
- **Gap négatif :** `Stealing it costs {x} NEAR more than it pays.` **Gap positif :** `Stealing it pays {x} NEAR. Whoever goes first.`
- **CTA :** `Buy`, `Sell`, `Rug it`, `Hold to rug`, `Try it, no wallet`.

**Divulgations obligatoires** (composant `Disclosure`, toujours rendu ; version courte en pied de l'écran principal, longue sur Rules) :
- `Testnet only. These tokens have no value. No real money is involved.`
- `Anyone can take the pot, at any moment, including right after you buy.`
- `Every buy and sell pays {fee}% into the pot. You lose that on a round trip.`
- `Bots and whales will probably win. In our simulation, a {w}% holder took {whale_share}% of the rugs.`
- `Without an attentive bot, about {no_bot}% of simulated games saw no rug at all.`
- `Simulations use assumed behaviour. They are not a forecast.`
- `Unaudited hackathon code.`

Les chiffres `{w}`, `{whale_share}` et `{no_bot}` viennent de `web/public/sim/summary.json`, jamais du texte.

**Mots interdits** dans l'interface, le README et le post X : `rug-proof`, `guaranteed`, `guaranteed floor`, `safe`, `risk-free`, `APY`, `returns`, `profit` présenté comme attendu. La phrase « plancher qui monte » ne sort jamais comme promesse. Un test parcourt la copie et le README (pas les bundles, où `safe` et `returns` apparaissent légitimement).

## 3. Direction visuelle

Voir `41-visual-direction.md`. Tout passe par `src/theme/tokens.css` et `src/theme/art/`. Correspondance des états : `data-zone` = `cold|warm|live|locked`, plus l'état `climax`.

Contraintes vérifiées : contraste 4,5:1 (texte) et 3:1 (grands chiffres, bordures utiles), états distingués par la forme et le texte, pas seulement la couleur.

## 4. Écrans (390×844 d'abord, vérifiés aussi à 390×664, Safari barres visibles)

Routage par hash, sans dépendance : `#/` Pot, `#/wall` Rug Wall, `#/log` journal, `#/proof/rules|sim|verify`. Paramètre `?i=fast|live`. Barre du bas : **Pot, Wall, Log, Proof**. Bandeau d'instance en haut de tous les écrans.

### 4.1 Pot (accueil)
Tout tient sans défilement à 390×664 selon le budget en pixels de 41 : bandeau d'instance, marquee, titre `STEAL THIS POT.`, **scène du tapis** (la cagnotte dessous, l'étiquette de prix, la main), dernier événement, dock `Buy / Sell / Rug it`, navigation. Les 3 lignes et le dépliant sont juste sous le pli.

**Jauge : la scène du tapis.** Le soulèvement du tapis EST l'Écart : plus il se ferme, plus le coin se soulève et plus on voit le tas de NEAR. L'étiquette de prix affiche `RUG PRICE {cost} NEAR`, le texte `POT {pot}` accompagne le tas, l'Écart (`Gap`) est un nombre secondaire.

| Zone | Condition | Rendu |
|---|---|---|
| Cold | Gap < -25 % du coût | Calme, `Not worth stealing. Yet.` |
| Warm | -25 % à 0 | La barre vibre légèrement, `Getting close.` |
| Live | Gap >= 0 | Inversion plein écran, `RUGGABLE. +{x} NEAR.` |
| Locked | pot < minimum | Barre grisée, `The pot needs {min} NEAR before anyone can take it.` |

Une seule version de l'Écart est affichée en titre : **Buy and rug** (`get_gap_buy`). Un dépliant `Details` donne les deux autres :
- `If you hold` (`get_gap_holder`) : ce que le rug rapporte de plus que vendre tes tokens.
- `Biggest holder` (`get_gap_exit`) : la même chose pour le plus gros détenteur connu du journal.

### 4.2 Buy et Sell (feuille basse)
Montant en NEAR (Buy) ou en tokens (Sell), raccourcis 25/50/100 %, devis via `quote_buy` / `quote_sell` (attente 200 ms après la frappe). Affiche : tokens reçus, frais vers le pot, prix minimal avec 1 % de tolérance. Le bouton passe `Signing… → Sent → Done` ; à la fin, une ligne s'imprime dans le journal.

### 4.3 Rug (feuille plein écran)
1. **Devis figé :** round, pot vu, tokens à brûler, tokens détenus, tokens à acheter, gain net estimé.
2. Si tokens insuffisants : `Buy and rug in one transaction`. Lots de deux FunctionCall (`buy` puis `rug`) vers le même contrat, donc **un seul receipt, atomique** ; si `rug` échoue, l'achat est annulé et le dépôt remboursé. Dépôt, `min_out`, `t_required` viennent de `get_gap_buy` ; dépôt ×1,01 et `max_burn = ceil(t_required × 1,01)`, le surplus reste en tokens. Si le solde ≥ T, simple `rug`.
3. Si le Gap est négatif, le rug reste possible : encart `You would lose {x} NEAR doing this.` et texte du bouton `Rug it anyway`.
4. **`min_payout`** vaut `pot vu − rug_fee` au figeage. Le champ est affiché en lecture seule ; `Advanced` permet de le baisser. **`round_id`** vaut le round figé.
5. **Maintien** 1,5 s, anneau de progression ; relâcher ou glisser hors du bouton annule. Alternative obligatoire (accessibilité) : réglage `Two-step confirm` (bouton puis bouton de confirmation), également pris en charge au clavier (Espace ou Entrée maintenus).
6. Juste avant l'envoi, nouvelle lecture de `get_state` : si le round a changé, on passe directement à l'état « course perdue » sans rien signer.

### 4.4 Rug Wall (`#/wall`)
Un panneau par rug, du plus récent au plus ancien, le plus gros pot en tête sous `Biggest heist` : numéro de round, `{account} took {pot} NEAR by burning {tokens}`, date, durée du round, lien explorateur, badge `BOT` ou `JUDGE` éventuel. Pas de « profit » affiché : le contrat ne connaît pas le prix de revient, et le texte le dit. Chaque panneau est une affiche WANTED (mugshot dérivé du hash du compte, badge `BOT` éventuel, voir 41). Bouton `Share` : PNG 1080×1350 généré côté client sur canvas, partagé via Web Share (fichiers), téléchargement en repli. Hébergement statique : pas d'image OG par manche.

### 4.5 Journal (`#/log`)
Une ligne par événement, **tous les mints et burns depuis le genèse**, façon rouleau de ticket : `#index`, type (`MINT` achat, `BURN` vente, `RUG` burn + pot pris, `FAILED` paiement échoué crédité au pot ; `data-kind`=`buy|sell|rug|payout_failed`), compte, tokens, NEAR, offre après, âge. Filtres `All / Mints / Burns / Rugs / Mine / No bots`. Virtualisé. En tête : `Audit` recalcule `somme(mints) - somme(burns)` depuis le journal entier et le compare à `ft_total_supply` ; résultat `Journal matches supply: {n} events` ou `MISMATCH` en clair. Un transfert NEP-141 n'est ni un mint ni un burn : il n'apparaît pas, et la page le précise.

### 4.6 Proof → Rules (`#/proof/rules`)
Prouve l'absence d'admin par des données live, pas par une affirmation :
- Tableau de tous les paramètres lus via `get_params` : valeur, signification, `Immutable`.
- **Clés d'accès du compte** via RPC `view_access_key_list` : on attend `0 keys`. Sinon, bandeau rouge. Compte verrouillé = le code ne peut plus changer.
- `code_hash` lu via `view_account`, comparé au hash du wasm publié dans le dépôt, avec la commande de rebuild.
- Liste des méthodes du contrat ; `No owner method exists.`
- **Fake accounts :** `Splitting across 100 accounts doesn't help: the rug price counts tokens, not accounts. Wash trading pays {fee}% into a pot you may not win. Limits: a whale doesn't need fake accounts, and a bot watching the Gap will usually beat you.`
- Les divulgations longues.

### 4.7 Proof → Simulation (`#/proof/sim`)
Lit `web/public/sim/summary.json` (produit par le simulateur, voir spec simulation). Multiples compacts par scénario, en SVG écrit à la main, sans bibliothèque : offre sur 60 jours (exigence du prompt), pot, et rugs marqués. Tableau scénarios et zone viable `τ/f` (1 à 7 environ). Bandeau permanent : `Assumed behaviour. Not a forecast.` Les limites (part de parties sans rug sans bot, baleine, valeurs lues dans `summary.json`) sont au même niveau visuel que les résultats, pas en note.

### 4.8 Proof → How to verify (`#/proof/verify`)
Liste « do X, see Y » numérotée pour humains et juges IA, chaque ligne avec son bouton `Run` (lecture seule, sans clé) et le résultat attendu à côté, plus la commande CLI équivalente :
1. `npm run verify` → tests, vérification journal = offre, 0 clé d'accès, hash du code.
2. `Open #/proof/rules` → `0 keys`.
3. `Open #/log, press Audit` → `matches supply`.
4. `npm run try:testnet` → crée un compte jetable au faucet, achète, vend, puis fait achat + rug sur l'instance fast, affiche les hashes. Aucun secret requis.
5. Curl RPC brut de `get_state`, à copier.

### 4.9 États (composant commun `StateView`)

| État | Rendu |
|---|---|
| Chargement | Squelette de la jauge, `Reading the chain…`. Pas de spinner seul. Après 8 s : `Still trying {rpc}.` |
| Vide, round neuf | `Pot's empty. Rug #{n} just happened. Trade to refill it.` |
| Vide, Wall | `Nobody has rugged yet. The price is printed. It's right there.` |
| Vide, Log | `No mints or burns yet. Be the first line on the receipt.` |
| RPC en panne | Bascule silencieuse sur le RPC suivant ; toutes en échec : `Chain unreachable. Showing frozen copy from {date}, block {h}.` Dock désactivé. |
| Données anciennes | Âge > 15 s : point `Stale` et âge visible à côté du Gap |
| Signature refusée | `You cancelled. Nothing happened.` |
| Solde insuffisant | Montant manquant, lien faucet ou `Try it, no wallet` |
| **Course perdue** | `Too slow. {account} rugged round {n} first.` `Your deposit is back. You only paid gas.` CTA `See the new round`. Déclenché par `E_ROUND_STALE`, `E_PAYOUT_BELOW_MIN`, ou le round lu avant l'envoi. `E_BURN_ABOVE_MAX` re-cote sans cet écran. Plein écran, drôle, jamais un toast d'erreur. |
| Instance inaccessible | `This instance isn't responding.` et lien vers l'autre |
| Bots à l'arrêt | `Demo bots are asleep. The coin doesn't need them. You can still rug it.` |

## 5. Le moment du rug

Déclencheur unique : `round_id` a augmenté dans `get_state`, pour **tous** les spectateurs. Séquence, images et état final : voir 41 (« Le climax »), qui finit toujours sur l'affiche WANTED nommant le voleur, passable au toucher.

Variante du rugger : `YOU RUGGED IT`, avec le hash. Variante d'un perdant de la course : écran « Too slow ». Vibration si disponible, son coupé par défaut. `prefers-reduced-motion` : un fondu et l'affiche statique. Animation en CSS (transform/opacity) et canvas dans `RugClimax`, rejouable via `?replay=1` pour les captures et la vidéo.

## 6. Mode démo et instance fast

Deux contrats, **même wasm**, paramètres différents fixés à l'initialisation :

| Instance | Rôle | Paramètres |
|---|---|---|
| `fast` (par défaut à l'ouverture) | Montrer l'action sans foule | Choisis pour que buy + rug coûte **au plus 4 NEAR** lorsque le Gap est positif (un compte faucet de 10 NEAR suffit) ; bots actifs, au moins un rug par heure en moyenne |
| `live` | Paramètres retenus après simulation | `deploy/live.json` ; bots modérés |

Le bandeau, permanent et non masquable, dit : `FAST DEMO INSTANCE · tuned to rug often · bots trading` ou `LIVE · simulated parameters · bots trading` ou `· bots asleep`. Le sélecteur d'instance est dedans.

Bots : comptes publics, badge `BOT` dérivé du suffixe `.acr-bots.testnet`, donc vérifiable ; instances et stratégies décrites dans `web/public/instances.json` ; filtre `No bots`. Ils n'appellent que les méthodes publiques, leur processus est **à part** (voir spec bots) et leurs clés ne sont jamais dans le bundle. Leur arrêt ne bloque ni la page ni la mécanique. Le compteur `bots share of volume` est affiché dans le journal, pour rester honnête.

### Déclencher un rug sans difficulté

| Option | Avantages | Inconvénients | Décision |
|---|---|---|---|
| **Compte jetable dans le navigateur, faucet** | Aucun serveur, aucun secret côté projet, vrai compte, vraie transaction | Dépend de `helper.nearprotocol.com` ; quota inconnu | **Principal** |
| Wallet NEAR Connect | Vrai wallet, sans copie de clé | Installation, testnet variable selon le wallet | Secondaire |
| Compte de démo relayé | Sans friction | Serveur qui signe : serait une clé à garder et un backend qu'on peut couper ; compte partagé donc courses entre juges | **Refusé** |
| Méta-transaction NEP-366 | Gaz sponsorisé | Le dépôt d'achat reste à fournir ; relais à faire tourner | Refusé |
| CLI `npm run try:testnet` | Parfait pour juge IA, sans navigateur | Nécessite Node | **Pour les juges IA** |

**Flux `Try it, no wallet` :** `KeyPair.fromRandom('ed25519')` dans le navigateur → `POST https://helper.nearprotocol.com/account` `{newAccountId, newAccountPublicKey}` (préflight CORS vérifié ; 10 NEAR, méthode déjà utilisée par TokenGo) → compte `rugger-<8 hex>.testnet` → `Burner ready: 10 NEAR`. Clé privée en `localStorage` (espace de noms par instance), jamais envoyée, jamais dans le bundle. Texte : `This is a throwaway testnet key stored in this browser. Don't put anything real here.` Bouton `Forget burner`.

Si le faucet échoue : `Faucet is busy.`, wallet ou CLI proposés, le reste de la page continue. Le test CI interdit toute clé `ed25519:` dans `dist/`.

## 7. Architecture

**Pile.** Vite, React 19, TypeScript strict. Pas de framework CSS, pas de bibliothèque de graphiques, pas de routeur, pas de gestionnaire d'état externe.

**Écritures.** `near-api-js` 7.4.0 chargé dynamiquement au premier achat : `new Account(id, provider, signer)`, `account.signAndSendTransaction({receiverId, actions, waitUntil:'EXECUTED_OPTIMISTIC', throwOnFailure:false})`, `KeyPair.fromRandom`. Avec `throwOnFailure:false`, on lit `status.Failure` pour détecter les erreurs de course. Wallets : `@hot-labs/near-connect` 0.12.0, `new NearConnector({network:'testnet'})`, `wallet.signAndSendTransaction({receiverId, actions:[{type:'FunctionCall',params:{methodName,args,gas,deposit}}]})`, également chargé à la demande. Le manifeste liste notamment Meteor et Intear comme compatibles testnet ; à vérifier réellement.

**Lectures.** `fetch` JSON-RPC simple (une quarantaine de lignes, sans dépendance), arguments en base64. Bascule dans l'ordre : `https://test.rpc.fastnear.com` → `https://rpc.testnet.near.org` → `https://archival-rpc.testnet.fastnear.com` (les trois répondent avec CORS `*`). Tout calcul économique vient de vues du contrat ; le navigateur ne fait aucune maths de courbe.

### 7.1 Obtenir chaque mint et burn sans backend

| Source | Mesure | Verdict |
|---|---|---|
| **État du contrat** (`get_journal`) | Vue servie par n'importe quel RPC, finalité courante | **Source principale** |
| FastNEAR tx API `tx.test.fastnear.com` | `POST /v0/account` (`resume_token`), `POST /v0/transactions` renvoie les `logs` ; historique depuis 2021 ; CORS OK | **Secondaire** : hashes et audit NEP-297. Service tiers. |
| RPC non archival | Blocs conservés environ 30 h seulement | Scan impossible |
| neardata `/v0/block` | 180 req/min/IP ; blocs d'environ 0,6 s, donc une journée = environ 145 000 blocs = 13 h de scan | Refusé |
| NearBlocks | API v1 retirée sur testnet (410 depuis le 5 nov) ; v3 OK avec CORS ; sans clé, **429 dès le 10e appel rapide** ; plan gratuit affiché : 6/min, 333/jour | Liens explorateur seulement |

**Choix.** Le contrat conserve son propre journal, en plus des événements NEP-297 `ft_mint` et `ft_burn`. N'importe qui, avec n'importe quel RPC, peut relire l'intégralité. C'est le seul moyen de tenir « pas de backend à couper » : tout indexeur en serait un.

Polling de `get_journal(from, 50)` uniquement quand `journal_len` a changé, puis cache `sessionStorage` par contrat. Un contrat ne connaît pas le hash de sa transaction : le lien explorateur est résolu à la demande via FastNEAR, avec repli sur le numéro de bloc.

**Repli statique.** `public/snapshots/<instance>.json`, généré par `npm run snapshot` (RPC seul), à chaque déploiement et avant soumission. Utilisé seulement si tous les RPC échouent, avec le bandeau daté de 4.9.

### 7.2 Interface avec le contrat

`20-contract.md` §3 fait foi, tel quel : `get_params`, `get_state`, `get_gap_holder`, `get_gap_buy(account_id?)`, `get_gap_exit(account_id)`, `get_rugs`, `get_rugs_len`, `get_journal`, `get_journal_len`, `quote_buy`, `quote_sell`, `buy(min_out)`, `sell(amount, min_out)`, `rug(round_id, min_payout, max_burn)`. Erreurs : §3.1 du contrat.

### 7.3 Hébergement
Build statique, chemins relatifs (`base:'./'`). **Railway** : un process Node sert `web/dist` et lance les bots en processus enfant (voir 50 §3). La page lit le RPC directement : la mécanique et la lecture fonctionnent sans notre serveur. Si l'hébergeur disparaît, `npm run web` redonne la page complète contre la même chaîne. En-têtes : CSP limitant `connect-src` aux RPC, à FastNEAR, au faucet, et aux origines requises par NEAR Connect (à relever au test).

### 7.4 Composants (`web/src/`)
`App`, `useHashRoute`, `InstanceBanner`, `BottomNav`, `Disclosure`, `StateView` ; `RugScene` (jauge), `GapDetails`, `Mascot`, `WantedPoster`, `Explainer`, `LastEvent`, `ActionDock` ; `BuySheet`, `SellSheet`, `RugSheet`, `HoldButton`, `RaceLost`, `RugClimax` ; `BurnerSetup`, `WalletMenu` ; `RugWall`, `RugCard`, `ShareButton` ; `Journal`, `JournalRow`, `JournalFilters`, `AuditBar` ; `ProofRules`, `AccessKeysProof`, `CodeHashProof`, `ProofSim`, `SmallMultiple`, `ProofVerify`, `VerifyStep`.
Modules : `chain/rpc.ts`, `chain/views.ts`, `chain/journal.ts`, `chain/errors.ts`, `chain/signer.ts` (burner ou wallet, chargé à la demande), `format/near.ts` (BigInt, jamais de `number` pour les montants).

### 7.5 État
Un `ChainStore` maison (`useSyncExternalStore`) par instance : `state`, `params`, `journal`, `lastOkAt`, `rpcIndex`. État local React pour les feuilles. Machine à états unique pour les actions : `idle → quoting → locked → signing → sent → done | raceLost | failed`.

### 7.6 Performance
- `get_state` toutes les 2 s si l'onglet est visible, à l'arrêt sinon, recul exponentiel jusqu'à 30 s sur erreur. Plafond : environ 30 req/min par visiteur.
- Bundle initial cible < 120 ko gzip, signature et wallets exclus.
- Journal virtualisé à la main, pages de 50, hauteur de ligne fixe.
- Polices : trois (voir 41), `font-display: swap`, sous-ensemble. Animations : `transform`/`opacity` seulement. Images WebP/AVIF autorisées.

### 7.7 Accessibilité
- Gap dans une région `aria-live="polite"`, annoncée au plus toutes les 10 s et à chaque changement de zone ; rug annoncé en `assertive`.
- Cibles tactiles >= 44 px, focus visible, feuilles avec piège de focus et Échap.
- Maintien toujours doublé d'une confirmation en deux temps (4.3).
- `prefers-reduced-motion` respecté, y compris le climax ; aucun clignotement au-delà de 3 Hz.
- Montants en texte réel, tableaux sémantiques sur Rules, description textuelle pour chaque graphique.

## 8. Contrat Playwright (`data-testid`)

Ces noms sont figés. Viewport de référence 390×844, données déterministes via `page.route` (réponses RPC capturées du vrai testnet, valeurs éditées pour chaque zone).

| Zone | Testids |
|---|---|
| Global | `instance-banner` `instance-switch` `instance-name` `bots-status` `nav-pot` `nav-wall` `nav-log` `nav-proof` `disclosure-short` `stale-indicator` `state-view` `frozen-copy-banner` |
| Pot | `gap-gauge` `gap-value` `gap-zone` (`data-zone`=cold/warm/live/locked) `pot-value` `rug-price-value` `gap-details` `gap-detail-hold` `gap-detail-whale` `explainer` `explainer-whats-a-rug` `last-event` `round-number` |
| Dock | `dock-buy` `dock-sell` `dock-rug` |
| Compte | `try-no-wallet` `burner-status` `burner-forget` `wallet-connect` `account-id` `account-balance` `faucet-error` |
| Buy/Sell | `buy-sheet` `buy-amount` `buy-quote-tokens` `buy-quote-fee` `buy-submit` `sell-sheet` `sell-amount` `sell-quote-near` `sell-submit` `tx-status` `tx-link` |
| Rug | `rug-sheet` `rug-round` `rug-pot-seen` `rug-burn-tokens` `rug-tokens-to-buy` `rug-net` `rug-min-payout` `rug-advanced` `rug-loss-warning` `rug-hold` `rug-two-step-toggle` `rug-confirm` |
| Issues | `race-lost` `race-lost-winner` `race-lost-new-round` `rug-climax` `rug-climax-skip` `rug-climax-winner` `rug-climax-poster` `rug-climax-share` `tx-error` `tx-cancelled` |
| Wall | `rug-wall` `rug-card` (`data-round`) `wanted-poster` `biggest-heist` `rug-share` `rug-wall-empty` |
| Journal | `journal` `journal-row` (`data-index`, `data-kind`) `journal-filter-all` `-mints` `-burns` `-rugs` `-mine` `-nobots` `journal-count` `journal-audit` `journal-audit-result` `journal-empty` `journal-bot-share` |
| Rules | `proof-tab-rules` `proof-tab-sim` `proof-tab-verify` `param-row` (`data-param`) `access-keys-count` `code-hash-live` `code-hash-published` `sybil-limits` `disclosure-long` |
| Sim | `sim-scenario` (`data-scenario`) `sim-supply-chart` `sim-assumption-banner` `sim-limits` |
| Verify | `verify-step` (`data-step`) `verify-run` `verify-result` `verify-cli` |

Parcours e2e minimaux : première visite et compréhension (3 lignes visibles sans clic) ; achat ; vente ; rug réussi avec maintien ; rug en deux temps ; course perdue ; climax vu par un spectateur ; Gap dans les 4 zones ; RPC en panne puis copie figée ; audit du journal ; absence de mots interdits et de clé dans `dist/`.

## 9. Incertitudes

1. **Faucet** : quota réel inconnu pour des créations depuis un navigateur. À tester le premier jour ; replis en section 6.
2. **FastNEAR et RPC publics** : pas de quota gratuit officiel trouvé pour le testnet. Bascule et polling modéré ; à observer sous charge.
3. **Wallets testnet NEAR Connect** : compatibilité déduite du manifeste, à essayer.
4. **Collisions de nom** : la recherche web ne voit pas tous les tokens.
