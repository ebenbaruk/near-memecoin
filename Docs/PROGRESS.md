# Avancement

**Phase actuelle : 3, le build.** Contrat terminé et testé ; simulateur, page et visuels en cours.

## Par où commencer
1. Lire `Docs/spec/10-spec.md`, puis la partie concernée de `Docs/spec/`.
2. Suivre le plan jour par jour de `Docs/spec/50-delivery.md` (date limite : **2026-11-14 23:59 UTC**).
3. Premières actions : vérifier le sandbox NEAR sur ARM64 (test `sandbox_smoke`, sinon repli testnet décrit dans `20-contract.md`) ; construire le contrat et ses tests ; simulateur en BigInt avec vecteurs partagés ; figer les paramètres **avant** le déploiement.
4. Mettre à jour ce fichier à chaque étape.

## Fait
- 2026-11-08 : contrat complet (`contracts/anyone-can-rug`) : 82 tests unitaires et de propriétés, 523 séquences de vecteurs TS rejouées en Rust, 9 tests sandbox (le sandbox tourne bien sur ARM64), répétition `rc1.acr-ops.testnet` validée par `scripts/e2e-testnet.ts` (29 contrôles, vraies transactions).
- 2026-11-08 : recherche, brainstorm (Anyone Can Rug), dépôt privé créé, spec écrite puis relue (cohérence, audit de sécurité, conformité, design), corrections appliquées.
- Test testnet : un `yield` non repris s'exécute après 201 blocs et peut se réarmer. **Retiré du design** ; preuve dans `04-brainstorm-tour1.md`.
- Prototype de simulation en flottants, à titre de référence seulement : `var/prototypes/rug-sim/` (hors git).

## Reste à valider par le propriétaire, au moment venu
Dépôt public, purge de l'historique, post X, soumission, push sur TokenGo.

## Points d'attention
- Budget opérateur : environ 31 NEAR le 2026-11-08 ; il en faut plus pour le déploiement final, le tournage et les bots : refinancer au faucet une fois le délai passé.
- **Faucet limité par IP** : `helper.nearprotocol.com` a répondu `429 Rate limit exceeded, retry in 8 hours` après une dizaine de créations. L'opérateur `acr-ops.testnet` a environ 54 NEAR (cible 150). Ne pas relancer `scripts/fund-operator.sh` avant le délai. Impact sur `Try it, no wallet` et `try:testnet` : le flux doit tenir le 429 proprement, et les juges auront leur propre IP.

## Bloqué
- Rien.
