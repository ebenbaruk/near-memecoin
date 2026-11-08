# Index de la spec

| Fichier | Contenu | État |
|---|---|---|
| `01-hackathon-et-categorie.md` | Calendrier, règles, catégorie Memecoins (prompt officiel et exigences), concurrence, partenaires, ressources | ✅ fait (recherche du 2026-11-08) |
| `02-brainstorm.md` | Grille de notation, 10 pistes, questions à trancher, décision | ✅ décidé |
| `04-brainstorm-tour1.md`, `05-brainstorm-wow.md` | Idées, attaques, avis simulés, règles après attaque | ✅ |
| `03-heritage-tokengo.md` | Obligation de citer TokenGo (Q-015), savoir-faire réutilisable, pièges connus | ✅ |
| `spec/10-spec.md` | **Point d'entrée de la spec** : pitch, règles, carte des documents, ordre de build | ✅ |
| `spec/20-contract.md` · `30-simulation.md` · `40-product-frontend.md` · `41-visual-direction.md` · `50-delivery.md` | Contrat, simulateur, produit et front, direction artistique, livraison (tests, vidéo, README, soumission) | ✅ relus |
| `PROGRESS.md` | Où on en est | à jour |
| `HUMAN-TODO.md` | Ce que seul l'humain peut faire | à jour |
| `sources/` | Copies brutes des sources officielles : HACKATHON.md, prompt de la catégorie, NEP-141, compétence agent `near-smart-contracts`, meme.cooking, BRRRAIN | — |

## Journal des décisions

| Date | Décision | Pourquoi |
|---|---|---|
| 2026-11-08 | 2e projet du propriétaire pour le NEAR HACKATHON, catégorie `memecoins` ; indépendant de TokenGo, les deux README se citent | Règle Q-015 ; catégorie peu disputée (11 projets sur 286, dont 2 seulement uniquement dans cette catégorie) |
| 2026-11-08 | Testnet uniquement ; aucun lancement mainnet (meme.cooking) sans accord explicite | Règle Q-010 ; argent réel |
| 2026-11-08 | Projet retenu : **Anyone Can Rug** (repli : IZNOP) ; After You écarté faute de « waouh » | Premier chez le degen et la salle du hackathon, sans précédent exact trouvé ; zone de paramètres viable en simulation. Décidé par Claude sur délégation |
| 2026-11-08 | `get_gap_buy` : marge `dx` portée de `+1` à `+1 + ONE/a + 2`, calcul poursuivi quand c'est infaisable | L'`isqrt` plancher peut minter jusqu'à `ONE/a + 1` unités de moins que `dx` : avec `+1`, le lot achat+rug pouvait échouer. Tolérance de `prop_no_free_rug` ajustée d'autant |
| 2026-11-08 | **Paramètres `live` figés : τ 5 %, f 2 %, a = 1e14 yocto (1e-10 NEAR), Pmin 0,05 NEAR, score 81,5 %.** Le point prévu (a 1e13, Pmin 1) obtient exactement 60,0 %, ni abandon ni changement forcé au §11 | Sélection §5 du simulateur. Finalistes à moins de 2 points et à τ/f = 2,5 : a 5e13 (82,0), a 1e14 (81,5), a 1e13 (80,0). 1e14 et 1e13 sont les plus ronds ; 1e14 l'emporte au score. L'instance `fast` garde ses paramètres de démo, non issus de la simulation |
| 2026-11-08 | Campagne de simulation réduite par rapport au §5 littéral : étape 2 criblée sur 20 seeds (505 couples), LHS de criblage 20×3 sur les 301 viables, 11 finalistes confirmés sur 100 seeds, LHS complet 200×5 sur ces 11 | Le plan littéral demandait plusieurs heures de plus. Une première exécution a été arrêtée à l'étape 2 avant tout résultat, aucun seuil modifié. Conséquence publiée dans `RESULTS.md` : une cellule hors du top 10 du criblage a pu être manquée, la bande repose sur 20 seeds |
| 2026-11-08 | `rules.ts` : `feasible` de `get_gap_buy` aligné sur le contrat (`x2 <= X_MAX`) | Le contrat fait foi. Vecteurs inchangés (même sha256), 523 séquences rejouées en Rust |
| 2026-11-08 | Le Mur et l'affiche WANTED affichent `payout` (pot moins `rug_fee`), pas `pot_before` ; `ROUND {n}` et `BOT` deviennent une plaque sous le portrait, le tampon `RUGGED` sort de l'affiche | La spec dit `{pot}`, mais le voleur reçoit `payout` : un seul nombre par rug. Aucun tampon ne couvre le visage ni le cadre |
| 2026-11-08 | Déploiement final `anyonecanrug.testnet` et `rugfast.acr-ops.testnet`, clés supprimées le jour même (avance sur le plan du 12 nov) | Audit indépendant sans faille, wasm reconstruit identique, paramètres figés, smoke complet avant verrouillage |
| 2026-11-08 | Refonte demandée par le propriétaire : vraie landing en pleine largeur qui explique la mécanique avec des schémas, section dédiée aux juges, jeu en pleine largeur. Hybride de 3 prototypes : plan de casse (compréhension), affiche (impact), coin de tapis (concept). Prévaut sur les budgets 390 px de `41-visual-direction.md` §4 | « Le design ne va pas du tout », « on ne capte pas ce que ça fait » ; jury en deux regards partagé |
