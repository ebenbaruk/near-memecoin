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
