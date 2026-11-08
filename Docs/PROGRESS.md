# Avancement

**Phase actuelle : 3, le build.** Rien n'est encore construit : ni contrat, ni simulateur, ni page. Aucun asset produit.

## Par où commencer
1. Lire `Docs/spec/10-spec.md`, puis la partie concernée de `Docs/spec/`.
2. Suivre le plan jour par jour de `Docs/spec/50-delivery.md` (date limite : **2026-11-14 23:59 UTC**).
3. Premières actions : vérifier le sandbox NEAR sur ARM64 (test `sandbox_smoke`, sinon repli testnet décrit dans `20-contract.md`) ; construire le contrat et ses tests ; simulateur en BigInt avec vecteurs partagés ; figer les paramètres **avant** le déploiement.
4. Mettre à jour ce fichier à chaque étape.

## Fait
- 2026-11-08 : recherche, brainstorm (Anyone Can Rug), dépôt privé créé, spec écrite puis relue (cohérence, audit de sécurité, conformité, design), corrections appliquées.
- Test testnet : un `yield` non repris s'exécute après 201 blocs et peut se réarmer. **Retiré du design** ; preuve dans `04-brainstorm-tour1.md`.
- Prototype de simulation en flottants, à titre de référence seulement : `var/prototypes/rug-sim/` (hors git).

## Reste à valider par le propriétaire, au moment venu
Dépôt public, purge de l'historique, post X, soumission, push sur TokenGo.

## Bloqué
- Rien.
