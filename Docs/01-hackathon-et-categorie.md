# NEAR HACKATHON : recherche pour le 2e projet (catégorie Memecoins)

Recherche du 2026-11-08. Les sources brutes téléchargées sont dans `Docs/sources/`.

## 1. Calendrier (UTC)

| Quoi | Quand |
|---|---|
| Fin du développement, date limite de soumission | **samedi 14 nov 2026, 23 h 59 UTC** (dimanche 00 h 59 à Paris) |
| Jugement | 16 au 18 nov |
| Résultats | au plus tard le 18 nov |
| Démo en ligne | à garder jusqu'au 18 nov au minimum, idéalement jusqu'au 25 nov |

Il reste **environ 6,5 jours**.

## 2. Règles qui nous concernent directement

- **Deux projets par personne au maximum** (règle Q-015). Ils doivent être **indépendants** et **chaque README doit citer l'autre**. Il faudra donc ajouter une mention de ce projet dans le README de TokenGo, et l'inverse.
- **Un dépôt GitHub ne peut être soumis qu'une fois** : il faut un nouveau dépôt, public avant la date limite.
- **Une soumission par projet**, mais on peut cocher plusieurs catégories. L'identifiant de la catégorie est `memecoins`.
- **Le testnet suffit** (Q-010). Aucune intégration n'est obligatoire : un contrat à nous sur NEAR qui colle à la catégorie suffit (Q-011).
- Le **code écrit depuis l'annonce** (19 oct) compte. Bibliothèques, modèles et code généré par IA sont autorisés, à lister dans le README (Q-005).
- Pièces à fournir :
  - un dépôt public avec une LICENSE ;
  - un post X qui mentionne NEAR HACKATHON, tague @NEARProtocol et #NEARHackathon, avec une vidéo ou des captures ;
  - un compte NEAR mainnet pour recevoir le prix (r4ality.near).
- **Jugement** : Claude Code et Codex font un premier tri. Ils vérifient que le projet tourne et fait ce que dit le README, et donnent une note préliminaire. Ce sont des humains qui décident.
  - Le README doit donc contenir des étapes « fais X, tu vois Y ».
  - Critères habituels des hackathons NEAR : réalisation technique, design, impact, originalité, pérennité.
- **Jurés humains** :
  - Illia Polosukhin (NEAR)
  - Eddy Lazzarin (a16z crypto)
  - Mert Mumtaz (Helius)
  - Avichal Garg (Electric Capital)
  - Kain Warwick (Synthetix)
  - Haseeb Qureshi (Dragonfly)
  - Stepan Gershuni (cyber•Fund)
- **Prix** : 10 000 $, 3 000 $ et 2 000 $ pour le podium de chaque catégorie, plus un grand prix unique de 55 000 $. Tout est payé en NEAR.

## 3. La catégorie « Memecoins With Mechanics »

> « The joke needs rules. » Build memecoins where the meme does something — supply that reacts to the community, treasuries with rules, onchain rituals and challenges. **Judged on the mechanic, not the chart.**

Mots-clés mis en avant : MEMECOINS, TOKEN MECHANICS, NEP-141.

### Prompt d'exemple officiel (dépôt `nearai/near-hackathon-prompt-examples`, `tracks/11-memecoins.md`)

L'idée d'exemple est un « streak coin » :
- chaque jour, chaque détenteur peut pointer une fois ;
- si la communauté atteint l'objectif du jour, chaque personne qui a pointé reçoit un petit mint ;
- sinon, une part de la trésorerie est brûlée et la série repart à zéro ;
- la plus longue série s'affiche comme un record.

**Exigences qu'ils attendent (le plus important) :**
1. Un token **NEP-141** dont **la mécanique est dans le contrat**, et non dans un serveur qu'on pourrait couper.
2. **Tous les paramètres sont fixés au lancement et lisibles par tous.** **Aucune clé d'admin** ne peut les changer ensuite.
3. Une **résistance aux faux comptes (sybil)** suffisante pour une démo, avec ses limites écrites honnêtement dans le README.
4. **Une page** qui montre l'état courant, la progression du jour et **le journal de chaque mint et de chaque burn**.
5. **Simuler 60 jours** de comportement de la communauté et montrer l'offre au fil du temps selon plusieurs scénarios, avant de choisir les paramètres.

### Ce que ça nous dit

Les juges veulent une **règle de jeu inscrite dans le contrat**, vérifiable, sans admin, et prouvée par une simulation. Le graphique de prix ne compte pas. C'est très proche de ce qu'on a fait avec TokenGo (règles pures, simulateur, preuve sur la chaîne).

## 4. La concurrence (annuaire du site, 2026-11-08)

- **286 projets** soumis au total, dont **seulement 11** ont coché Memecoins.
- **Seulement 2** sont uniquement dans cette catégorie : **Tripwire** et **OATH**.
- Les 9 autres cochent beaucoup de catégories à la fois, sans doute par opportunisme : Sidelot, NDBOT, Greed Machine, TheRascalsDotFun, Meridian, Realsies, Public Agent Coin (PAC), 777 giros gratis, Swarmpad.

**Conclusion : la catégorie est peu disputée.** Un projet propre, centré sur une seule mécanique bien prouvée, a de vraies chances d'être sur le podium.

Posts de démo des deux concurrents « purs » :
- Tripwire : https://x.com/samaisback/status/2118030472676769978
- OATH : https://x.com/OpeyemiBolatit1/status/2118986219585441920

## 5. Partenaires utiles pour un memecoin

- **meme.cooking** (lanceur de memecoins sur NEAR, par Shitzu)
  - Lancement équitable par enchère : tout le monde achète au même prix, pas de courbe de prix.
  - Compte à rebours de 5 min à 1 jour, avec un seuil minimum (soft cap) et un plafond optionnel (hard cap).
  - Si le seuil est atteint, environ 50 % des tokens partent dans un pool Ref Finance dont la liquidité est verrouillée 69 ans, et environ 50 % vont aux déposants.
  - Retirer avant la fin coûte 2 %, redistribués aux autres déposants. Une part optionnelle pour l'équipe est possible, débloquée progressivement.
  - Sites : https://meme.cooking, docs https://docs.meme.cooking, API https://api.meme.cooking
  - ⚠️ Un vrai lancement se fait sur **mainnet**, donc avec du vrai argent : pas sans ton accord. On peut s'en inspirer, ou l'intégrer en lecture seule.
- **BRRRAIN** (memecoin qui donne de l'IA)
  - Détenir au moins 1 BRRRAIN donne chaque jour une ration de « Power » : des crédits d'IA via une API compatible OpenAI (https://api.brrrain.fun/v1).
  - Elle est financée par du NEAR mis en staking. La connexion se fait par signature NEP-413, sans transaction.
  - Bon exemple de « memecoin utile ». Docs : https://brrrain.fun/docs/
- **Ref / Rhea Finance** : l'échange décentralisé (DEX) de NEAR. Pools, swaps, kits de développement : https://github.com/rhea-finance/rhea-sdk-docs
- **SputnikDAO** et **Trezu** : trésoreries et multisignatures. Utile pour une « trésorerie avec des règles ».
- **NEAR Intents** : exécution entre chaînes (mainnet uniquement, pas de testnet).
- **NEAR AI Cloud** : de l'IA privée. 10 $ de crédits gratuits en rejoignant NEAR Builders.

## 6. Ressources techniques

- Standard NEP-141 (token fongible) : `Docs/sources/nep-0141-fungible-token.md`
- Compétence agent `near-smart-contracts` : `Docs/sources/skill-near-smart-contracts.md`. Pour tout installer : `npx skills add near/agent-skills`.
- Docs pour les IA : https://docs.near.org/llms.txt
- Consignes officielles pour les agents : `Docs/sources/HACKATHON.md`. **À relire en version en ligne avant de soumettre.**
- Prompt d'installation et liste de vérification avant soumission : `Docs/sources/prompt-examples-00-setup.md`, `Docs/sources/prompt-examples-SUBMITTING.md`.
- On sait déjà faire, grâce à TokenGo :
  - contrat Rust sur testnet, compte opérateur, recharge par faucet ;
  - simulateur d'économie ;
  - hébergement Railway ;
  - vidéo Playwright + ffmpeg ;
  - soumission par API.

## 7. Pistes pour démarrer le brainstorm

Ce ne sont que des amorces. Chacune vise « une mécanique dans le contrat, sans admin, prouvée par simulation ».

- **Rituel quotidien** : le streak coin de l'exemple, ou une variante où la communauté doit « nourrir » la mascotte, sinon elle maigrit (burn).
- **Offre qui réagit** : chaque transfert brûle ou mint selon une règle (heure, taille, nombre de détenteurs actifs). Par exemple, un token qui « a froid » quand personne ne bouge.
- **Trésorerie à règles** : une cagnotte qui ne s'ouvre que si un défi collectif est atteint. Sinon, elle brûle ou passe au round suivant.
- **Défis entre clans** : deux tokens ou deux équipes. Le perdant de la semaine brûle une part, le gagnant récupère la trésorerie.
- **Patate chaude** : détenir le token trop longtemps fait perdre une part au profit du suivant. Il faut le faire circuler.
- **Pont avec le monde réel ou l'IA** : comme BRRRAIN, une utilité concrète liée à la détention.

**Ce qu'il faut garder en tête :**
- Le projet doit être **indépendant de TokenGo**.
- Tester sur testnet. Jamais de mainnet ni d'argent réel sans ton accord.
- Il reste 6 jours : une seule mécanique, très bien faite, plutôt que dix à moitié faites.
