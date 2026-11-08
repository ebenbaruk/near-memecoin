# 10. Spec : point d'entrée

**Anyone Can Rug, ticker `$RUGPRICE`.** *Every coin has a rug price. This one prints it.*
NEAR HACKATHON, catégorie `memecoins`. Testnet uniquement. Date limite : 2026-11-14 23:59 UTC.

## Pitch
Chaque memecoin a un prix secret auquel un initié peut partir avec l'argent. Ici, ce prix est affiché sur la page, et n'importe qui peut le payer. Chaque échange verse 2 % dans une cagnotte ; quiconque brûle 5 % de l'offre la prend, son nom reste gravé, et une nouvelle manche commence.

## Règles finales (détail : `20-contract.md`)
- NEP-141 à 18 décimales ; courbe linéaire `p = p0 + aS` dans le contrat ; aucun admin, aucun oracle, aucune allocation aux initiés ; 0 clé d'accès après déploiement.
- Frais `f = 2 %` à l'achat et à la vente, versés à la cagnotte.
- `rug(round_id, min_payout, max_burn)` brûle `T = τ·max(S, 0,9·HWM)`, `τ = 5 %`, et verse `pot − rug_fee`. Mode C : `x` et la réserve ne bougent pas au rug. Atomique avec `buy` dans une même transaction.
- Écart affiché : acheter-puis-ruguer (`get_gap_buy`) ; les deux autres sont dans un dépliant.
- Journal de chaque mint et burn dans le contrat, prépayé, lisible sans backend ; événements NEP-297 en plus.
- `storage_unregister` panique toujours (déviation NEP-145 assumée).
- Paramètres figés dans `deploy/{live,fast}.json` après simulation (`30-simulation.md`), avant le déploiement final. Deux instances, même wasm : `live` et `fast`.

## Carte des documents

| Fichier | Contenu |
|---|---|
| `20-contract.md` | Contrat, maths, erreurs, journal, tests, déploiement, `verify`, limites |
| `30-simulation.md` | Simulateur 60 jours, vecteurs partagés, balayage, règle de décision |
| `40-product-frontend.md` | Copie, écrans, états, bots, architecture, testids |
| `41-visual-direction.md` | Concept, palette, états, climax, assets |
| `50-delivery.md` | Dépôt, comptes, bots, tests, vidéo, README, soumission, plan |

**Priorité en cas de conflit :** le contrat fait foi pour méthodes, champs, erreurs et paramètres ; 41 pour le visuel ; 50 pour les chemins et scripts. Un écart se corrige, et la décision se note dans `Docs/00-INDEX.md`.

## Ordre de build
1. Squelette, comptes, faucet, test du sandbox ARM64 (30 min maximum).
2. Contrat et tests (unitaires, propriétés, vecteurs).
3. Simulateur, vecteurs, sélection : **gel des paramètres** avant déploiement.
4. Répétition sur `rc1`, puis planche de référence des assets.
5. Page, assets, climax, e2e 390×844 avec revue des captures.
6. Déploiement final, suppression des clés, hébergement, bots.
7. README, `verify` sur clone neuf, vidéo.
8. Accords humains (50 §9), puis soumission unique.

## Définition de « fini »
Celle de `50-delivery.md` §5 : `npm ci && npm run verify` vert depuis un clone neuf et sans `.env` ; 0 clé sur les contrats ; les 5 exigences de la catégorie démontrables en « do X, see Y » ; simulation publiée avec ses mauvais résultats ; chaque capture relue, zéro erreur console ; bots actifs depuis 24 h ou plus et un rug réel dans le journal ; vidéo relue ; `check:secrets` vert ; rien laissé ouvert.

## Accords humains requis
Dépôt public, purge de l'historique (avec le force-push associé), post X, soumission, push sur TokenGo. Les pushs sur le dépôt privé `ebenbaruk/near-memecoin` sont permis.
