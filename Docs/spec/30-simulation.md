# 30. Simulation : spécification

**But.** Choisir τ, f, la courbe et Pmin *avant* le déploiement final, montrer l'offre sur 60 jours (« supply over time under a few scenarios », exigence de la catégorie) et publier ce que le modèle ne sait pas. Le comportement des agents est **supposé, jamais calibré sur des données** : la simulation compare des variantes, elle ne prédit rien.

**Point de départ.** Le prototype flottant (`rug-sim/`) sert d'hypothèse, pas de résultat. Ce qu'il suggère : le rug part quand le volume depuis le dernier rug, rapporté à la capitalisation, atteint environ τ/f (P = f·V, coût ≈ τ·p·S). D'où une bande viable en τ/f, à reconfirmer.

| Limite du prototype | Correction ici |
|---|---|
| Choc de panique postérieur au premier rug | Scénario `panic-early` : choc tiré entre J2 et J10 |
| Baleine myope | Baleine à politiques multiples, on retient la meilleure (§3) |
| Flux retail indifférent au prix | Arrivées et ventes dépendent du momentum et de la perte latente (§3) |
| Courbe linéaire seule | La courbe linéaire du contrat est imposée ; 4 pentes balayées (§5) |
| Flottants | BigInt partout dans l'état ; flottants réservés aux décisions d'agents (§2) |
| Échelle unique (~12 000 NEAR d'achats) | Scénario `tiny` à l'échelle d'une démo de hackathon (§4) |

## 1. Architecture
`sim/` : TypeScript pur, Node figé (`.nvmrc`), aucune dépendance d'exécution sauf `@resvg/resvg-js` pour le PNG.

| Module | Rôle | Contrainte |
|---|---|---|
| `rules.ts` | Machine à états du contrat | Fonctions pures, BigInt, aucun flottant |
| `rng.ts` | sfc32, flux nommés `fork(seed, "retail.arrival")` | `Math.random` interdit (règle de lint) |
| `agents/*.ts` | Une fonction de décision par agent | Lit l'état, renvoie des actions |
| `engine.ts` | Horloge horaire, 1 440 ticks, événements mélangés dans le tick | Vérifie les invariants à chaque action |
| `scenarios.ts`, `sweep.ts`, `sensitivity.ts`, `metrics.ts` | Campagnes et agrégats | Runs indépendants, résultats triés |
| `charts.ts` | SVG écrit à la main, puis PNG | Sortie déterministe |
| `vectors.ts` | Génère et rejoue les vecteurs partagés | §2 |

**Déterminisme.** Même `(params, scénario, seed, version Node)` ⇒ même sortie, octet pour octet. Un test compare le SHA-256 du JSON canonique à une valeur figée (`sim/golden.json`). Chaque usage du hasard a son propre flux : une action ajoutée ne décale pas les autres tirages, ce qui garde les comparaisons rug/témoin appariées.

## 2. `rules.ts` et vecteurs partagés
Unités : yoctoNEAR et plus petite unité du token, en BigInt. Taux en points de base. **Le document du contrat fait foi** : ce tableau reprend les règles du brainstorm et se corrige sur lui en cas d'écart.

| Opération | Effet (mode C) | Arrondi, toujours en faveur de la réserve |
|---|---|---|
| `buy(deposit)` | Après `reg_min` éventuel et `journal_fee` ; exige ≥ `min_buy` ; fee = f·dépôt vers P ; net ; x, S, R augmentent ; poussière vers P ; HWM = max(HWM, S) | fee au plafond, tokens au plancher, `isqrt` au plancher |
| `sell(q)` | gross = r(x) − r(x−q) ; fee vers P ; `journal_fee` retenu ; x, S diminuent | fee au plafond, `payout ≥ journal_fee` |
| `rug(round, min_payout, max_burn)` | Exige P ≥ `pot_min`, round courant, T ≤ `max_burn`, solde ≥ T, `P − rug_fee ≥ min_payout` ; brûle T ; x et R inchangés ; B += T ; verse `P − rug_fee` ; P remis à 0 ; round + 1 ; HWM = max(S, ρ·HWM) | T = τ·max(S, ρ·HWM), au plafond |

Courbe unique, celle du contrat : `r(x)` linéaire au plafond, `inv(R)` au plancher (spec contrat §4). Les frais `journal_fee`, `rug_fee`, `min_buy`, `reg_min` changent les montants : ils sont modélisés, pas exclus.

**Tranché par le contrat.** ρ s'applique deux fois (`HWM ← max(S, ρ·HWM)` après un rug, puis `ρ·HWM` dans T), fixé à `hwm_floor_bps = 9000`.

**Invariants vérifiés à chaque action (égalités exactes)**
- I1, conservation : `entrées = sorties + R + P + frais retenus (journal, rug, enregistrement)` (témoin à frais perdus : `+ void`).
- I2, position : `x = S + B`.
- I3, réserve : `R == r(x)` exactement ; la poussière d'arrondi va dans P.
- I4, plancher : `R ≥ R(B)`. I5 : `HWM ≥ S`. I6 : `x`, `S`, `R`, `P` ≥ 0.

**Propriétés testées**
- *Pas de machine à sous* : pour une attaque en solo sur tout enchaînement buy/sell/rug, gain net ≤ part de P financée par les autres.
- *Wash neutre* : les frais qu'un laveur se reverse ne changent pas le signe de `P_autres − coût(T)`, le gas en plus.

**Vecteurs** : `fixtures/vectors.json`, nombres en chaînes décimales, généré par `npm run sim -- vectors --seed 1`, committé, rejoué tel quel par le TS et par un test Rust (`include_str!`).
```json
{ "version": 1, "sequences": [ {
  "id": "fuzz-0007", "params": { "tau_bps": 500, "fee_bps": 200, "hwm_floor_bps": 9000, "pot_min": "1000000000000000000000000", "min_buy": "...", "journal_fee": "...", "rug_fee": "...",
    "p0": "...", "a": "..." },
  "steps": [ { "op": "rug", "actor": "a2", "args": { "round": "1", "min_payout": "0", "max_burn": "..." },
    "expect": { "ok": true, "error": null, "returned": "...",
      "state": { "x": "...", "S": "...", "B": "...", "R": "...", "pot": "...", "hwm": "...", "T": "...", "round": "2" },
      "balance": { "a2": "..." } } } ] } ] }
```
- Couverture : au moins 500 séquences de 50 pas, plus des cas limites nommés : achat de 1 yocto (`E_BELOW_MIN_BUY`), P = `pot_min` et `pot_min`−1, solde = T et T−1, round périmé, `min_payout` = `P − rug_fee + 1`, T > `max_burn`, vente trop petite, vente de tout S, plus gros achat autorisé, carré parfait pour `isqrt`, buy+rug atomique.
- `error` reprend les codes stables du contrat (`E_ROUND_STALE`, `E_POT_BELOW_MIN`, `E_INSUFFICIENT_TOKENS`, `E_PAYOUT_BELOW_MIN`, `E_BURN_ABOVE_MAX`, `E_SLIPPAGE`, `E_BELOW_MIN_BUY`, `E_SELL_TOO_SMALL`, `E_ABOVE_X_MAX`). Rust doit reproduire **tous** les champs (`vectors_replay`).
- 20 séquences sont aussi rejouées sur le wasm en sandbox (`sandbox_vectors_replay_20`) (frais de stockage et de gas exclus de la comparaison).
- Tout écart bloque `npm run verify`. `sim/out/selected-params.json` alimente seulement `deploy/{live,fast}.json`, seuls fichiers canoniques de l'`init` ; `verify` compare `get_params` à ces derniers. `selected-params.json` est committé **avant** la transaction de déploiement, et le README cite les deux. Les paramètres de l'instance `fast` sont choisis pour la démo, pas par la simulation, et le README le dit.

## 3. Agents (hypothèses)
Tous les nombres sont des valeurs de départ arbitraires, balayées au §6. Les décisions sont en flottant ; les montants passent en BigInt par une seule fonction.

| Agent | Modèle | Défaut |
|---|---|---|
| **Retail** | Achats Poisson : `L(t)·exp(βm·clip(m24,−1,1))·(1+αr·news(t))`, `L = 100·e^(−j/20)+10` par jour. m24 = variation log du prix sur 24 h ; news décroît sur 12 h après un rug. Taille lognormale (médiane 3 NEAR, σ 1, max 300). 33 % de rachats. Vente horaire : `s0·exp(βd·perte_latente)`, majorée de κ au-delà de +100 % ; vend 50 à 100 % | βm 1 ; αr 0,5 ; s0 8 %/j ; βd 1,5 ; κ 1 |
| **Détenteur opportuniste** | Retail qui détient ≥ T, rugue si `P − valeur nette de T > gas` | 100 % des détenteurs concernés |
| **Sniper attentif** | N bots. Buy+burn atomique dès que `P − C(T) > gas + marge`. Latence : voit l'événement avec probabilité `a` par tick. Gagnant aléatoire si plusieurs | N 2 ; a 1 ; marge 0 |
| **Baleine patiente** | Accumule jusqu'à w % de S, plafond par heure. Politiques : `myope` (sort dès que rentable), `seuil θ` (attend `gain ≥ θ·coût`, θ ∈ {1,5 ; 3}), `inventaire` (brûle sans vendre, répète), `dump-and-rug` (vend pour baisser T : teste le plancher HWM). **Résultat publié : la meilleure politique par cellule** | w 25 % ; 40 NEAR/h ; retour 5 j |
| **Laveur** | Stock de 1,05·T, aller-retour de V NEAR par jour, tente le rug | V 400 |
| **Pool sybil** | n comptes, achats fractionnés, stockage payé par compte, regroupement par `ft_transfer` puis rug | n 100 ; 0,00125 NEAR/compte |
| **Foule paniquée** | Choc : ventes ×M et achats ×b pendant D jours. Réaction au rug : proportion π vend 50 % | M 5 ; b 0,15 ; D 5 ; π 15 % |

Le sybil n'a aucun avantage attendu puisque le prix du rug est en tokens, pas par tête. Le test vérifie `gain sybil ≤ gain baleine à capital égal`.

## 4. Scénarios (60 jours, 30 seeds ; 100 pour la sélection)
Chaque scénario tourne trois fois, sur les mêmes seeds : **rug**, **témoin A** (mêmes frais, envoyés au néant, pas de rug), **témoin B** (f = 0, pas de rug).

| Id | Contenu | Ce qu'il teste |
|---|---|---|
| `organic` | Retail + snipers | Référence |
| `no-bot` | Retail seul | Le jeu existe-t-il sans bots ? (90 % sans rug au prototype) |
| `whale` | + baleine (meilleure politique) | Capture du jeu |
| `wash`, `sybil` | + l'agent concerné | Identités |
| `panic-early` | Choc tiré entre J2 et J10, **avant** le premier rug | Plancher HWM, T devenu inatteignable |
| `panic-after` | Choc 6 h après le premier rug | Cascade |
| `hype` | `300·e^(−j/5)+30`, s0 20 %/j | Rugs en rafale |
| `dead` | Lancement puis presque plus de flux dès J3 | Cagnotte orpheline |
| `tiny` | Flux ×0,02 (quelques centaines de NEAR) | Échelle réelle d'une démo ; rôle de Pmin |
| `all-in` | Snipers + baleine + laveur + sybil ensemble | Compétition entre attaquants |

## 5. Balayage et sélection
Grille : τ ∈ {1, 2, 3, 5, 7, 10, 15, 20} % ; f ∈ {0,5 ; 1 ; 2 ; 3 ; 5} % ; p0 = 1e-5 NEAR ; a ∈ {1e-12, 1e-11, 5e-11, 1e-10} ; Pmin ∈ {0,05 ; 1 ; 5 ; 20 ; 50} NEAR (Pmin = 0 est refusé par le contrat).
- **Étape 1** : τ × f × a à Pmin = 1 ; `organic`, `hype`, `tiny`, `panic-early` ; 20 seeds.
- **Étape 2** : les cellules viables × tous les Pmin, tous les scénarios, 100 seeds.

**Cellule viable** si tout est vrai (seuils écrits avant de lancer, repris du prototype quand ils existent) :
| | Critère | Seuil |
|---|---|---|
| V1 | Invariants | 0 violation |
| V2 | `organic` : parties sans aucun rug | ≤ 20 % |
| V3 | `organic` : premier rug médian ; rugs médians | ≥ 3 j ; entre 1 et 12 |
| V4 | `hype` : premier rug médian ; rugs médians | ≥ 1 j ; ≤ 20 |
| V5 | `tiny` : au moins un rug dans ≥ 50 % des parties | Sinon Pmin ou l'échelle sont faux |
| V6 | Écart apparié retail, rug − témoin A (points de capital investi), médiane, `organic` / `whale` | ≥ −1 / ≥ −5 |
| V7 | `panic-early` : au moins un rug après le choc | ≥ 30 % des parties |

**Sélection.** Pour chaque cellule viable, score = part des 200 tirages de sensibilité (§6) où elle reste viable. On prend le score maximal ; à moins de 2 points, on préfère le plus proche de τ/f = 2,5, puis des valeurs rondes. Elle n'est lancée **qu'une fois** ; toute relance après modification des seuils est notée dans le journal de `00-INDEX.md`. La bande viable est publiée : heatmap τ × f par pente, marquant `jamais` / `viable` / `dégénéré`.

## 6. Analyse de sensibilité
- **Un facteur à la fois** autour du point retenu : tornado sur le nombre de rugs, le premier rug et l'écart retail.
- **Hypercube latin** de 200 tirages sur tous les facteurs à la fois ; corrélations de rang pour classer les hypothèses.

| Facteur | Plage | Facteur | Plage |
|---|---|---|---|
| Multiplicateur de flux | 0,02 à 3 | π (panique au rug) | 0 à 0,5 |
| βm | 0 à 3 (0 = prototype) | αr | −0,5 à 2 |
| s0 | 2 à 30 %/j | βd | 0 à 3 |
| Bots N / attention a | 0 à 5 / 0,05 à 1 | Marge sniper | 0 à 1 NEAR |
| w baleine | 5 à 40 % | Médiane et σ des tailles | 1 à 10 / 0,5 à 1,5 |
| ρ (what-if, le contrat le fixe à 0,9) | 0,8 à 1 | Gas | 0,001 à 0,05 NEAR |

Toute hypothèse dont la variation fait sortir le point retenu de la bande est **citée nommément** dans le README.

## 7. Métriques (médiane, p10, p90 ; IC bootstrap sur les écarts appariés)
- **Rythme** : part sans rug, premier rug, nombre de rugs, intervalle entre rugs.
- **Cagnotte** : taille au rug, cagnotte orpheline à J60, part des jours où l'Écart est positif, pour chacune des trois versions de l'Écart.
- **Offre** : S(t), burn cumulé B, part de S brûlée, réserve R, plancher `p(B)`.
- **Qui gagne** : part des rugs et des NEAR de cagnotte par type d'agent ; PnL de chaque agent ; indice de concentration des rugs.
- **Retail** : retour total valorisé à la sortie collective (vente au prorata sur la courbe, nette de frais), part de gagnants, écart apparié à A et à B.
- **Santé** : violations d'invariant, temps de calcul.

## 8. CLI et sorties
```
npm run sim                     # pipeline complet : sweep → sélection → sensibilité → scénarios → graphiques
npm run sim -- --quick          # 1 point, 3 scénarios, 5 seeds (sans secret ni réseau, utilisé par npm run verify)
npm run sim -- scenario organic --seed 42 --params '{"tau_bps":500,...}'
npm run sim -- sweep | sens | charts | vectors | check-golden
```
Codes de sortie : 0 OK, 1 invariant violé, 2 golden ou vecteurs divergents, 3 aucune cellule viable. Runs répartis sur `worker_threads`. Budget : `--quick` < 30 s, complet < 20 min sur 12 cœurs, à mesurer (BigInt plus lent que le prototype).

| Sortie | Pour |
|---|---|
| `sim/out/manifest.json` | SHA git, version Node, seeds, hash des paramètres |
| `sim/out/runs/*.json`, `sweep.json`, `sensitivity.json`, `selected-params.json` | Reproductibilité |
| `docs-assets/sim/supply-over-time.{svg,png}`, `viable-band`, `tornado`, `retail-vs-control`, `who-rugs` | README |
| `docs-assets/sim/RESULTS.md` | Section générée, insérée entre marqueurs (§10) |
| `web/public/sim/summary.json` : séries quotidiennes par scénario, seed représentatif, bande viable, point retenu | Page, sans recalcul |

## 9. Afficher « l'offre dans le temps »
Le graphique principal, `supply-over-time`, est ce que la catégorie demande explicitement.
- Petits multiples, 6 panneaux : `organic`, `whale`, `panic-early`, `hype`, `dead`, `tiny`. Axe x : J0 à J60. Axe y : `ft_total_supply`, échelle propre à chaque panneau, indiquée.
- Dans chaque panneau : bande p10-p90 et médiane du coin rug ; médiane du témoin A en pointillé ; **seed représentatif** (celui dont le S final est le plus proche de la médiane) en trait fin, pour voir les marches que la médiane lisse. Trait vertical à chaque rug de ce seed ; bande de densité des rugs sous l'axe, toutes seeds confondues.
- Légende obligatoire : « Modelled agents. Supply only; not a price forecast. »
- Sur la page : même graphique en SVG, sélecteur de scénario (lisible à 390 px), position réelle testnet superposée sous le libellé « live testnet », jamais mêlée aux données simulées.
- Tableau d'accompagnement : S à J10, J30, J60 ; burn cumulé ; nombre de rugs.

## 10. Section README exacte (anglais, générée ; les `{…}` viennent de `RESULTS.md`)
```markdown
## Simulation: 60 days, before parameters were chosen
These results come from **modelled agents whose behaviour we assumed**. Nothing is fitted to real trading data.
They compare parameter choices. They are not a forecast and imply no return for anyone.

Reproduce: `npm run sim -- --quick` (seconds) or `npm run sim` (about {runtime} min). Seeds and code are in `sim/`.
Rules are integer-exact and replayed against the contract with {n_vectors} shared test vectors.

![Supply over time under six scenarios](docs-assets/sim/supply-over-time.png)

| Scenario | Games with no rug | Median rugs | Supply at day 60 vs control | Retail vs fee-burn control |
|---|---|---|---|---|
{table}

**Control coin:** same bonding curve and same agents, but no rug; fees are destroyed (A) or absent (B).
Retail column: paired median difference in percentage points of capital invested, with bootstrap CI.

**Parameters chosen:** tau {tau}, fee {f}, curve {curve}, Pmin {pmin}, selected by the rule in `Docs/spec/30-simulation.md`.
The viable band is tau/f between {low} and {high}:

![Viable band](docs-assets/sim/viable-band.png)

**What the model says that you should not like**
- Bots and whales will probably win. With a {w}% holder in the game, that holder took {whale_share}% of rugs.
- Without an attentive bot, {no_bot}% of modelled games saw no rug.
- Assumptions that change the conclusion most: {top_3_sensitivity}.
- Timing depends on an assumed order flow; at demo scale, {tiny_result}.
```
Formulations **interdites** partout : « rug-proof », « guaranteed floor », « safe », un APY, un rendement simulé présenté comme attendu. On écrit « anyone can take the pot », « 2 % per trade », « bots and whales probably win ». Le tableau montre toujours `no-bot` et `whale`, même si ces lignes desservent le projet.

## 11. Règle de décision (appliquée le 10 nov. au soir, avant le déploiement final)
**Changer les paramètres** (nouvelle exécution de la sélection, journalisée) si :
- le point prévu τ 5 % / f 2 % sort de la bande ou tombe sous 60 % de score ;
- `tiny` échoue uniquement à cause de Pmin ⇒ baisser Pmin ;
- `panic-early` échoue ⇒ tester τ et Pmin, le contrat fixe ρ ;
- `whale` échoue sur V6 mais pas `organic` ⇒ τ plus haut dans la bande, et écrire la limite ;

**Abandonner pour IZNOP** si l'une de ces conditions tient après correction :
1. Une propriété ou un invariant du §2 est faux à cause de la **règle** et non d'un bug : un attaquant seul gagne sans cagnotte financée par d'autres.
2. Aucune cellule ne passe V1 à V4 sur `organic` et `hype`, pour aucune courbe.
3. Le score maximal reste sous 25 % : la viabilité tient alors à des hypothèses choisies.
4. Écart retail apparié à A, IC 95 % entièrement sous −10 points dans `organic`, sur toute la bande : le jeu n'est qu'une taxe sur le retail.

**Pas un motif d'abandon**, seulement une limite à publier : les baleines et bots gagnent, `no-bot` sans rug, cagnotte orpheline dans `dead`. Après le 11 nov. au soir, le design est figé : un mauvais résultat ne déclenche plus que des paramètres et des limites écrites.
