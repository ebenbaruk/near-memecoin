# Brainstorm, tour « waouh » (2026-11-08)

Le propriétaire n'est pas convaincu par le candidat précédent : intelligent, mais sans « waouh ». Le seul critère de ce tour : **est-ce qu'on a envie de le raconter, et est-ce que ça semble évident après coup ?** Ordre sans signification. Les mécaniques sont des esquisses, non attaquées.

Contraintes : NEP-141, mécanique dans le contrat, aucun admin, pas d'oracle, testnet, construit seul + IA en 6 jours, page mobile, simulation 60 jours.

## 1. AFTER YOU
Tout le monde est enfermé. La porte s'ouvre gratuitement dans 14 jours. N'importe qui peut payer pour l'ouvrir plus tôt, mais elle s'ouvre pour tout le monde, au même prix.

## 2. IZNOP ($IZNOP) : « PONZI à l'envers »
Le premier schéma de Ponzi inversé : **les premiers acheteurs paient les derniers.** À chaque nouvel achat, une part est prélevée sur les anciens détenteurs (d'autant plus qu'ils sont anciens) et donnée au nouveau, sous forme de bonus qui se débloque progressivement. Le gain habituel d'être arrivé tôt sur la courbe est repris. Les snipers et les initiés deviennent les bienfaiteurs des derniers arrivés.

## 3. BIGGEST LOSER ($COPE)
Le contrat connaît le prix de revient de chacun. Une taxe sur chaque échange est versée à **celui qui a perdu le plus.** Classement public des pertes ; la pire perte du jour reçoit la cagnotte. La pire décision de ta vie devient un poste à pourvoir.

## 4. ANYONE CAN RUG ($RUG)
**N'importe qui peut ruguer ce coin, le prix du rug est affiché sur la page.** Une cagnotte grossit. Pour la prendre, il faut brûler un seuil de tokens qui monte avec la cagnotte. Le rug est donc public, chiffré, permissionless : tout le monde surveille qui accumule.

## 5. THE QUIET GAME
Tous les détenteurs sont payés chaque jour où personne ne bouge le coin. Un transfert casse tout, le traître paie et reçoit une pierre tombale.

## 6. EXIT LIQUIDITY ($EXIT)
Tu ne peux vendre qu'une fois qu'un nouveau venu a pris ta place. Le plus ancien sort d'abord. La page est un tableau des départs d'aéroport : « Siège 412. Tu pars quand 411 inconnus seront arrivés. »

## 7. DRAW THE CHART
Les juges ne notent pas le graphique. Alors la communauté le **dessine** : chaque bougie est votée, le contrat achète ou brûle depuis sa réserve pour obtenir ce prix. En ce moment, le graphique écrit « GM ».

## Résultats (sparring partners simulés, un seul modèle)
| Idée | Degen | Novice | Salle/juges : chance /10 | Précédents |
|---|---|---|---|---|
| Anyone Can Rug | 1er | 7e (« rug » inconnu) | 7 | Jeux de rug voisins, pas de prix public permissionless trouvé |
| IZNOP | 4e | 2e | 6 | Aucun trouvé ; faille : remise à zéro de l'ancienneté, personne n'achète en premier |
| Exit Liquidity | 3e | 1er | 4 | Doublers 2016 ; honeypot assumé |
| Draw the Chart | 2e | 6e | 4 | Aucun trouvé ; arbitrage qui vide la réserve |
| Biggest Loser | 5e | 4e | 4 | TopBlast, REKT : déjà fait |
| After You | 6e | 5e | 4 | Aucun trouvé |
| Quiet Game | 7e | 3e | 2 | Partiel |

En réserve : $FIEF, proposé par l'inventeur (pyramide selon l'arbre des noms NEAR, fonctionne sans foule).

## Règles après attaque (modèle flottant 60 j, comportements supposés, à refaire)
- Courbe p = p0 + aS dans un seul contrat ; frais f = 2 % à chaque échange, versés à la cagnotte ; sans admin ni oracle.
- `rug(round, min_payout)` : brûler T = τ·max(S, 0,9·HWM), τ = 5 %, prend la cagnotte. Le burn réduit la circulation, la position sur la courbe et la réserve restent (mode C, plancher qui monte).
- Cagnotte minimale 1 NEAR (testnet). Jauge : l'Écart, en trois versions (détenteur, achat puis rug, sortie du plus gros détenteur).
- Mesuré : zone viable pour τ/f entre 1 et 7 environ ; en dessous, le rug est immédiat, au-delà il n'arrive jamais. Le wash trading ne rapporte rien (identité vérifiée ; agent de wash médian −886 NEAR).
- Limites : sans bot attentif, 90 % des parties organiques ne voient aucun rug ; une baleine à 25-33 % a pris 100 % des rugs ; le calendrier dépend d'un flux supposé.
- À écrire : « anyone can take the pot », 2 % par échange, bots et baleines gagnent probablement. Interdit : « rug-proof », « guaranteed floor », rendements simulés présentés comme attendus.
