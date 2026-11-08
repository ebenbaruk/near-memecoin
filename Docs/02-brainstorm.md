# Brainstorm : quel memecoin construire ?

Statut : **à faire avec l'humain** dans la prochaine session. Ce fichier sert de point de départ. On y note les pistes, les notes, puis la décision finale, qu'on reporte aussi dans le journal de `00-INDEX.md`.

## Comment on choisit : la grille (note de 0 à 5 par critère)

| Critère | Pourquoi il compte | Poids |
|---|---|---|
| **Mécanique dans le contrat** | C'est la 1re exigence du prompt officiel : vérifiable sur la chaîne, sans admin | ×3 |
| **Compréhensible en 10 s** | Les jurés humains (Illia, a16z, Dragonfly…) voient des centaines de projets | ×3 |
| **Drôle ou « mème »** | C'est un memecoin : la blague doit faire partie de la règle | ×2 |
| **Démontrable par un juge en 2 min** | Les juges IA déroulent le README : « do X, see Y » sur testnet | ×2 |
| **La simulation dit quelque chose** | Le prompt exige 60 jours et plusieurs scénarios ; il faut des courbes intéressantes (spirale, équilibre, effondrement) | ×2 |
| **Faisable en ~5 jours en solo + IA** | Date limite : sam. 14 nov, 23 h 59 UTC | ×2 |
| **Originalité face aux 11 concurrents** | Voir la liste dans `01-hackathon-et-categorie.md` §4 | ×1 |
| **Résistance aux faux comptes défendable** | Exigée ; on peut documenter honnêtement ses limites | ×1 |

## Contraintes de forme (rappel)
- Token **NEP-141**, testnet. Paramètres **immuables** à la création et lisibles par une méthode de lecture `get_params`. **Aucune** méthode d'admin.
- Le temps sur la chaîne vient de `env::block_timestamp()`. Les « jours » sont des époques définies dans le contrat.
- Le hasard sur la chaîne (`env::random_seed()`) est **manipulable par les validateurs** : à éviter pour tout ce qui a de la valeur, ou à documenter.
- Une méthode « tick » publique, que n'importe qui peut appeler (récompense optionnelle pour l'appelant), pour clôturer une époque sans dépendre d'un serveur.
- Tout mint et tout burn émet les **événements NEP-297** standard (`ft_mint`, `ft_burn`), pour que la page les journalise.

## Pistes de départ (à challenger, combiner ou jeter)

Chaque piste suit le même format : la règle, ce qui la rend drôle, et le risque principal.

1. **Streak coin** (l'exemple officiel)
   - Règle : pointage quotidien. Si l'objectif collectif est atteint, ceux qui ont pointé reçoivent un mint ; sinon, une part de la trésorerie brûle et la série repart à zéro. Le record de série est affiché.
   - Risque : c'est l'exemple du prompt, donc beaucoup le feront. Il faut une **torsion** pour se distinguer.

2. **Tamagotchi coin**
   - Règle : la mascotte doit être nourrie chaque jour. Nourrir coûte des tokens, qui partent pour moitié en burn et pour moitié à la cagnotte.
   - Si elle a faim, l'offre fond chez tout le monde (*rebase* négatif). Si elle est bien nourrie, elle grandit et débloque des paliers.
   - Risque : un *rebase* sur NEP-141 est délicat (soldes calculés à la volée).

3. **Patate chaude** (*hot potato*)
   - Règle : chaque solde « refroidit ». Garder trop longtemps sans transférer fait perdre un pourcentage, envoyé au prochain receveur ou brûlé.
   - Drôle : le token qui interdit le *HODL*.
   - Risque : faux transferts vers soi-même → les interdire et les documenter.

4. **Guerre de clans**
   - Règle : chaque détenteur rejoint un camp (chat contre chien…). Chaque semaine, le camp qui a le plus « brûlé pour sa cause » gagne : la cagnotte va au camp gagnant, une part du camp perdant brûle.
   - Risque : il faut du monde pour la démo → simulation et agents de démo.

5. **Fléau des baleines** (anti-*whale*)
   - Règle : plus ton solde est gros, plus la taxe de transfert l'est, et elle est redistribuée aux petits portefeuilles. La courbe est publique dans les paramètres.
   - Risque : on peut contourner en découpant son solde sur plusieurs comptes. Il faut le documenter, voire en faire une blague.

6. **Rituel collectif** (*summoning*)
   - Règle : la communauté doit accomplir N actions avant une date. En cas de succès, c'est « l'invocation » (gros mint ou débloquage de la trésorerie). En cas d'échec, tout le dépôt brûle.
   - Variante : un enchaînement de défis.

7. **Coin de la météo / du monde réel**
   - Règle : l'offre réagit à une donnée externe (météo de Paris, score d'un match…) fournie par un oracle.
   - Risque : un oracle, c'est un serveur, ce qui contredit la règle « pas de backend qu'on coupe ». À éviter, sauf avec un oracle sur la chaîne.

8. **Memecoin à défi IA**
   - Règle : un défi quotidien (énigme, prompt). La réponse est engagée sous forme de hash puis révélée (*commit/reveal*). Les bonnes réponses mintent.
   - Atout : lien avec NEAR AI.
   - Risque : il faut un juge, donc on revient à un serveur. Le *commit/reveal* avec une réponse hachée et publiée d'avance règle une partie du problème.

9. **Loterie de burn honnête**
   - Règle : chaque jour, on brûle pour acheter des tickets ; le tirage se fait par *commit/reveal* entre participants.
   - Risque : régulation et hasard. Plutôt à éviter.

10. **Coin qui vieillit** (*demurrage* / *fresh coin*)
    - Règle : les tokens perdent de la valeur avec le temps s'ils ne servent pas ; les utiliser les « rafraîchit ».
    - Atout : vrai concept économique (la monnaie fondante de Gesell), servi façon mème.

## Questions à trancher pendant le brainstorm
- Quel nom, quel ticker, quelle mascotte ? Le *pitch* doit tenir sur un tweet.
- Faut-il un aspect jeu ? Le propriétaire a le savoir-faire de TokenGo, mais les projets doivent rester **indépendants**.
- Faut-il une intégration de partenaire ? Lecture des données meme.cooking ou Ref, ou cagnotte via SputnikDAO. Ce n'est pas obligatoire (règle Q-011).
- Comment montrer de l'activité pendant le jugement ? Des agents de démo sur testnet peuvent jouer la communauté : à documenter clairement comme tels.
- Quelles autres catégories cocher, honnêtement ? Peut-être `social`. Rester sobre : les autres participants en cochent 6 à 8, ce qui fait opportuniste.

## Décision
**Retenu (2026-11-08) : ANYONE CAN RUG**, décidé par Claude sur délégation du propriétaire. « Every coin has a rug price. This one prints it. » Détail, avis et simulation : `05-brainstorm-wow.md`. Ticker à vérifier dans la spec ($RUG et $COPE sont encombrés). Solution de repli : IZNOP.
