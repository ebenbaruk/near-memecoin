# Avancement

**Phase actuelle : 3, le build.** Contrats finaux déployés et verrouillés (0 clé), démo en ligne sur https://web-production-69c90.up.railway.app, `verify` vert (33 contrôles). Reste : recharge faucet, bots actifs 24 h et plus, instance `film` et vidéo, accords humains.

## Par où commencer
1. Lire `Docs/spec/10-spec.md`, puis la partie concernée de `Docs/spec/`.
2. Suivre le plan jour par jour de `Docs/spec/50-delivery.md` (date limite : **2026-11-14 23:59 UTC**).
3. Premières actions : vérifier le sandbox NEAR sur ARM64 (test `sandbox_smoke`, sinon repli testnet décrit dans `20-contract.md`) ; construire le contrat et ses tests ; simulateur en BigInt avec vecteurs partagés ; figer les paramètres **avant** le déploiement.
4. Mettre à jour ce fichier à chaque étape.

## Fait
- 2026-11-08 : simulation 60 jours terminée, paramètres `live` figés (τ 5 %, f 2 %, a 1e14, Pmin 0,05 NEAR) ; répétition `rc2` avec ces paramètres : 29 contrôles sur 29 ; `npm ci && npm run verify` sur clone neuf sans `.env` : seuls échecs attendus (clé sur rc1, `anyonecanrug.testnet` pas encore déployé), 1 min 09.
- 2026-11-08 : contrat complet (`contracts/anyone-can-rug`) : 82 tests unitaires et de propriétés, 523 séquences de vecteurs TS rejouées en Rust, 9 tests sandbox (le sandbox tourne bien sur ARM64), répétition `rc1.acr-ops.testnet` validée par `scripts/e2e-testnet.ts` (29 contrôles, vraies transactions).
- 2026-11-08 : recherche, brainstorm (Anyone Can Rug), dépôt privé créé, spec écrite puis relue (cohérence, audit de sécurité, conformité, design), corrections appliquées.
- Test testnet : un `yield` non repris s'exécute après 201 blocs et peut se réarmer. **Retiré du design** ; preuve dans `04-brainstorm-tour1.md`.
- Prototype de simulation en flottants, à titre de référence seulement : `var/prototypes/rug-sim/` (hors git).

## Reste à valider par le propriétaire, au moment venu
Dépôt public, purge de l'historique, post X, soumission, push sur TokenGo.

## Points d'attention
- Budget opérateur : 13,4 NEAR le 2026-11-08 au soir (23 NEAR perdus sur des comptes jetables d'une répétition qui a planté, script corrigé). Il faut plus pour les bots et le tournage : refinancer au faucet une fois le délai passé (429 reçu vers 17:35 le 8 nov, retry 8 h, relance programmée à 01:45 le 9).
- Railway : projet `anyone-can-rug`, service `web`, `BOTS_ENABLED=0` tant que les bots ne sont pas créés. Déployer avec `railway up --service web` depuis un clone propre (jamais depuis le dossier de travail).
- **Faucet limité par IP** : `helper.nearprotocol.com` a répondu `429 Rate limit exceeded, retry in 8 hours` après une dizaine de créations. L'opérateur `acr-ops.testnet` a environ 54 NEAR (cible 150). Ne pas relancer `scripts/fund-operator.sh` avant le délai. Impact sur `Try it, no wallet` et `try:testnet` : le flux doit tenir le 429 proprement, et les juges auront leur propre IP.

## Bloqué
- Rien.
