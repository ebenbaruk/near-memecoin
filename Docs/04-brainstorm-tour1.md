# Brainstorm, tour 1 : idées consolidées (2026-11-08)

Issues de 5 agents indépendants : veille, mécanisme, produit, culture, NEAR. Les affirmations de nouveauté n'ont pas toutes été vérifiées. Les invariants sont dérivés à la main et n'ont pas été simulés.

## Ce que dit la veille
- **12 projets** dans la catégorie (BEFEWER ajouté le 8 nov).
- Déjà pris : anti-rug avec zéro clé (Tripwire, Swarmpad), distribution par travail (Swarmpad), pari minoritaire (BEFEWER), promesses (OATH), détection IA (Realsies), agents (PAC, Greed Machine, Meridian).
- Peu occupé, d'après des posts courts : mort programmée d'un coin ; sanction des initiés après le lancement ; coopération avec perte réelle ; rituel collectif quotidien.
- À éviter : burn ou buyback seuls, trésorier IA, launchpad, tout ce qui dépend d'une hausse de prix.
- Juges : Lazzarin hostile aux memecoins (veut un vrai résultat de mechanism design) ; Warwick favorable (règles simples qui frappent les initiés) ; Qureshi lassé du label « agent IA » ; Illia : les agents comme utilisateurs, et les primitives NEAR.

## Catalogue complet
**Mécanisme** : ONE DOOR (sortie quotidienne plafonnée, enchère de décote) · MINORITY REPORT (la minorité gagne ; proche de BEFEWER) · ICEBREAKER (frais croissants jusqu'au premier transfert) · NOREKT (droit de remboursement personnel) · CAPTAIN (rachat LIFO) · JUDAS (pacte à trahison dégressive) · OOPS (contrat d'assurance dominant) · MORTAL/RIP (mort datée, prolongation par burn doublant).

**Produit** : FLAKE · IOU1 (dette entre amis, cycles qui s'annulent) · EMAIL (réunions budgétées) · MAD (séquestre à burn mutuel) · WORD (promesse à témoin ; proche d'OATH) · KNOCK (timbre anti-spam) · MEAT (preuve de poignée de main) · ALIVE (héritage).

**Culture** : EXIT (file FIFO) · SHH · ALIVE (faucheurs) · FOOL (prix plancher croissant) · TERMS (vesting pour tous) · MEH (DAO de l'apathie) · T2 (heures de banque) · SYBIL.

**NEAR** : PULSE (règlement par timeout yield, sans keeper) · TAB (clés function-call, le coin paie le gas) · ABROAD (Chain Signatures brûle de l'ETH Sepolia) · PYRAMID (arbre des sous-comptes) · MORTAL (sous-comptes qui s'auto-suppriment) · RENT (éviction).

## Finalistes à attaquer (ordre sans signification)

### A. FIRE EXIT ($EXIT) : fusion d'ONE DOOR et d'EXIT
Le token est adossé à une réserve de NEAR. On mint à NAV plus une prime. On ne sort contre la réserve que par une porte quotidienne, plafonnée à c % de la réserve. Les vendeurs enchérissent la décote qu'ils acceptent ; ceux qui acceptent la plus forte passent d'abord ; tous paient la décote de compensation (≥ h_min).
Invariant annoncé : la NAV par token ne baisse jamais et monte à chaque sortie ; réserve après n jours ≥ R₀(1−c)ⁿ ; une panique enrichit ceux qui restent. Page : tableau des départs, file, décote du jour.

### B. FLAKE ($FLAKE) : le coin dont personne ne veut
RSVP signé à un événement ; à l'événement, les présents se co-signent par QR ; moins de 2 co-signatures à la clôture = 1 $FLAKE minté. Il brûle après 2 présences ultérieures ou passe à quelqu'un qui l'accepte. Les hôtes filtrent : « max 1 FLAKE ». Limite : deux amis peuvent co-signer de chez eux.

### C. MAD ($MAD) : Mutually Assured Delivery
L'acheteur bloque prix + caution, le vendeur bloque une caution ; seule la libération par l'acheteur rend tout. Sans libération, les deux cautions brûlent : ni juge ni opérateur. Cas d'usage : agents IA et inconnus. Limites : dépit, extorsion par menace de burn. Précédent : BitHalo/Particl.

### D. LAST WILL ($RIP) : fusion de MORTAL et ALIVE
Le coin meurt à une date écrite dans le contrat ; la réserve est alors rachetable au prorata, pas avant. N'importe qui peut retarder la mort d'un jour en brûlant des tokens, le coût double à chaque fois, donc la mort est prouvablement finie. Page : certificat de décès, testament, journal des réanimations.

### E. PULSE ($PULSE) : le battement sans gardien
Coin de pointage (exemple officiel) dont chaque tour est un `yield` que personne ne reprend : la chaîne déclenche elle-même le règlement au timeout, 200 blocs ≈ 2 min. Limites : le gas est prépayé (quelques centaines de sauts estimés), il faut réamorcer, et yield depuis un callback n'est pas testé. Peut aussi servir de couche de règlement pour A ou D.

### F. THE QUIET GAME ($SHH)
Chaque jour sans aucun transfert, tous les détenteurs accumulent un mint réclamable (réclamer n'est pas transférer). Un transfert casse la série et l'expéditeur brûle des frais qui croissent avec la durée du silence. Une démo vide est une réussite ; un seul défecteur suffit, donc les faux comptes importent peu. Page : pierre tombale de chaque silence brisé.

## Grille (`02-brainstorm.md`)
Mécanique dans le contrat ×3 · compréhensible en 10 s ×3 · drôle ×2 · démontrable en 2 min ×2 · la simulation dit quelque chose ×2 · faisable en 5 jours ×2 · originalité ×1 · résistance aux faux comptes ×1. Exigence du propriétaire en plus : vraie utilité, réaction « pourquoi personne n'y a pensé ? ».

## Résultats du tour 2 (attaque, jury simulé, UX, test testnet)
- **Moyennes du jury simulé /80** (un seul modèle, trois profils) : F 63,7 · A 60,3 · D 55,7 · C 50,3 · B 47,7 · E 30,7. Aucun finaliste ne mérite tel quel la réaction recherchée.
- **Attaque** : B mort (blanchiment par compte neuf, présence invérifiable). E mort comme coin. A : la prime d'entrée ressemble à PoWH, à retirer. C : token décoratif. D : aucune raison rationnelle de réanimer. F : wrapper et compte fantoche.
- **Testnet** (protocole 88, near-sdk 5.30.1) : un `yield` non repris s'exécute après 201 blocs (≈ 2 min) et son callback peut réarmer le suivant depuis une seule transaction. 9 sauts observés ; environ 300 sauts pour 1 PGas extrapolés avec 5 écritures par saut. Preuve : https://testnet.nearblocks.io/txns/FdbBudAwQWGJEwVdfdr8VdXbMUtb3KFr4jp2gtaybZjq

## Candidat issu du tour 3 : AFTER YOU (v3, à valider)
Fusion de A et F, attaquée et simulée sur 60 jours (agents modélisés, hypothèses inventées, à refaire proprement).
- Token adossé à 100 % à une réserve de NEAR, minté à la NAV, sans allocation aux initiés. Mint fermé pendant une fenêtre.
- La porte de sortie est fermée et s'ouvre gratuitement à l'issue d'un compte à rebours T (7 à 14 j).
- N'importe qui peut l'ouvrir plus tôt en brûlant F = fmax·(1−d/T), un montant indépendant de ce qu'il retire. Elle s'ouvre alors pour tout le monde.
- Fenêtre W ≥ 24 h (hauteur de bloc, `settle()` public) ; la capacité c % est répartie au prorata à péage uniforme de 1 à 2 %.
- `yield` : cloche optionnelle, jamais source de vérité.

Mesuré (simulation) : baleine à 40 % → 97 % des sorties si W = 2 min, 59 % à 72 h ; panique : 330 ouvertures et réserve de 100k à 1,5k avec frais croissants à 2 min, contre 6,6 ouvertures et réserve à 72k avec compte à rebours à 24 h ; à N ≥ 100 la porte devient calendaire (ouverture vers T).
Limites : un DEX ou un wrapper contourne la porte ; le prorata pousse à sur-verrouiller ; dépôt irrationnel hors jeu ; combinaison sans précédent direct trouvé, recherche limitée, ne pas écrire « first ». Formulations interdites : rendement, gains, « NAV ne baisse jamais » sans préciser en NEAR.
