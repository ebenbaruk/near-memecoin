# Ce qu'on a appris avec TokenGo (1er projet) et comment le réutiliser

TokenGo est dans `../TokenGo` (https://github.com/ebenbaruk/TokenGo, catégorie `games`, soumis le 2026-11-07, description mise à jour via request-changes le 2026-11-08).
Démo : https://tokengo-production-195c.up.railway.app

## Obligation : citer les projets l'un dans l'autre (règle Q-015)
- **Ici** : section « Other project by the same author » dans le README, avec un lien vers TokenGo et une phrase précisant que les deux projets sont indépendants (pas de code, de contrat ni de token en commun).
- **Dans TokenGo** : ajouter la section miroir dans `../TokenGo/README.md` une fois le nom et le dépôt de ce projet connus, puis committer et pousser.
  - Ce push a été autorisé dans le cadre du projet, mais redemander si on a le moindre doute.
  - Le tag `hackathon-submission-v2` de TokenGo n'a pas besoin de bouger.
- Si besoin, mentionner l'autre projet dans le champ « Anything we should know? » de la demande de modification de TokenGo. Ce n'est pas obligatoire, les README suffisent.

## Savoir-faire réutilisable (on recopie l'approche, pas le code importé)

| Sujet | Ce qui a marché | Où regarder dans TokenGo |
|---|---|---|
| Contrat Rust | `near-sdk` 5.30.1, profil release `opt-level="z"`, `lto`, `panic="abort"`, `overflow-checks=true` ; tests unitaires avec la fonctionnalité `unit-testing` | `contracts/tokengo-mt/` (Cargo.toml, NOTES.md) |
| Outils | `cargo near build non-reproducible-wasm`, `near` (near-cli-rs 0.31.1) déjà installé sur la machine | `Docs/06-blockchain.md` |
| NEAR de test | Faucet : créer des comptes jetables via `https://helper.nearprotocol.com/account` (10 NEAR chacun), puis `deleteAccount` avec le compte opérateur comme bénéficiaire | `apps/server/scripts/fund-testnet.ts` (bibliothèque `near-kit`) |
| RPC | `https://test.rpc.fastnear.com` (testnet), gratuit | idem |
| Preuves sur la chaîne | Liens vers l'explorateur pour chaque transaction ; page « Proofs » qui compare la chaîne et l'état affiché | `apps/server/src/chain/` |
| Simulateur | Règles en fonctions pures partagées entre simulateur, serveur et interface ; CLI `npm run sim -- --days 7 --players 200` | `packages/shared/src/economy/`, `apps/sim` |
| Hébergement | Railway : un seul service Dockerfile, sans instruction `VOLUME` (volume monté depuis l'interface sur `/data`), `startCommand` dans `railway.json`, générer un domaine public, origine acceptée via `RAILWAY_PUBLIC_DOMAIN` | `Dockerfile`, `railway.json`, `apps/server/src/config.ts` |
| Vidéo de démo | Playwright enregistre, ffmpeg monte (paysage + portrait + miniature) ; serveur jetable, sans chaîne ni secret | `scripts/video/` |
| Captures | `npm run shots` → `docs-assets/` | `scripts/collect-shots.ts` |
| README pour juges IA | Étapes « do X, see Y », `npm run verify` sans secret, schémas mermaid, tableau des tests | `README.md` |
| Soumission | Script de validation + envoi (`--send` seulement après accord humain), `requestId` stable | `scripts/submit.ts` |
| Secrets | `npm run check:secrets` : aucun secret dans le dépôt ni l'historique | `scripts/check-secrets.ts` |

## Pièges déjà rencontrés
- `LackBalanceForState` : le contrat n'a plus assez de NEAR pour stocker ses données → recharger via le faucet.
- Railway :
  - « docker VOLUME not supported » → retirer l'instruction `VOLUME` ;
  - services créés automatiquement par workspace → n'en garder qu'un seul ;
  - l'URL `*.railway.internal` est privée → il faut générer un domaine public.
- Erreur 403 sur l'origine en production → normaliser les origines autorisées avec `new URL(u).origin`.
- Les tests e2e deviennent instables quand la machine est chargée → rendre les tests déterministes (graine fixe, pas de hasard).
- Les boucles `until ! pgrep -f "X"` se détectent elles-mêmes et ne s'arrêtent jamais.
- La lecture de `.env` par un agent peut être refusée par le classifieur de sécurité. Charger les clés via le code (dotenv), sans les afficher.
- Post X limité à 280 caractères : compter avant de proposer.
