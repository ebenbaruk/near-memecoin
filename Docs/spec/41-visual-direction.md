# 41. Direction artistique

Prévaut sur `40-product-frontend.md` pour tout ce qui est visuel. Références du propriétaire : `var/Inspi-design/` (hors git) ; s'en inspirer pour l'esprit, sans reprendre leurs logos, personnages ou compositions.

## 1. Le concept

**La page est un tapis. La cagnotte est dessous.**

Le site est un **tapis noué à la main, précieux et absurde, qui raconte le crime crypto**. De loin, c'est un tapis d'héritage avec médaillon central, bordures et franges. De près, ses motifs sont des petits voleurs masqués, des sacs de NEAR, des bougies de chandelier qui s'effondrent, des clés barrées, des mains qui tirent. Une étiquette de marchand pend du coin : **RUG PRICE**.

On garde des références l'énergie d'affiche (typo énorme, couleurs franches, grain, mascotte épaisse), mais l'identité vient du **textile** : chaque aplat a une trame, chaque bord une frange, et les chiffres semblent cousus sur une étiquette de magasin. Ce n'est ni un dashboard crypto, ni un simple pastiche années 70.

**L'image explique la mécanique :** le soulèvement du coin du tapis EST l'Écart. Plus le vol devient rentable, plus le tas de NEAR apparaît. Quand il est rentable, le tapis est à moitié enlevé.

Interdits : néon, dégradé violet-bleu, verre dépoli, grille de cartes grises, chandeliers de trading réels, jauge donut, graphique de prix en page d'accueil.

## 2. Palette (seules couleurs autorisées, images comprises)

| Token | Valeur | Rôle |
|---|---|---|
| `--ink` | `#14160D` | Fond calme, trame sombre |
| `--brown` | `#3A1D0E` | Texte sur moutarde, rose et rouille ; contours |
| `--cream` | `#F6EFDC` | Texte sur fond sombre, franges |
| `--mustard` | `#F2C230` | Alerte, or du tapis, tas de NEAR |
| `--rust` | `#F0562B` | Danger, mascotte, rouge du tapis |
| `--pink` | `#F59AC4` | Action principale, Live |
| `--teal` | `#0F7B6C` | Étiquettes, motifs, action sûre |
| `--sage` | `#DDE3B5` | Panneaux de preuve, étiquette de prix |
| `--cobalt` | `#2457A6` | Accent de la trame |

Contraste : crème sur moutarde interdit ; brun requis sur moutarde, rose et rouille pour le texte courant.

Typographie (Google Fonts, à valider à 390 px) : titres Fraunces 900 (axes SOFT et WONK au maximum) ou Bagel Fat One ; texte Instrument Sans ; chiffres et labels DM Mono, façon étiquette de marchand.

## 3. Quatre états, une couleur par zone (`data-zone`)

| Zone | Condition (voir 40) | Couleur | Tapis | Mascotte | Texte |
|---|---|---|---|---|---|
| `locked` | pot < minimum | `--ink`, clous `--sage` | Cloué au sol, à plat | Dort | `The pot needs {min} NEAR before anyone can take it.` |
| `cold` | Gap < -25 % du coût | `--ink` | Plat, un pli à peine visible | Un œil ouvert | `Not worth stealing. Yet.` |
| `warm` | -25 % à 0 | `--mustard`, texte `--brown` | Coin qui se soulève proportionnellement | Sue, regarde le dernier échange | `Getting close.` |
| `live` | Gap ≥ 0 | Alternance `--rust` / `--pink` à moins de 3 Hz | Moitié enlevé, tas de NEAR visible | Panique | `RUGGABLE. +{x} NEAR.` |

`climax` est un cinquième état transitoire, voir §6.

## 4. Premier écran (budget en pixels à 390×664, le cas le plus dur)

| Bloc | Hauteur | Contenu |
|---|---|---|
| Bandeau d'instance | 32 | `FAST DEMO INSTANCE · tuned to rug often · bots trading` |
| Marquee | 24 | `ANYONE CAN STEAL THE POT` et les derniers événements |
| Titre | 92 | `STEAL THIS POT. {pot} NEAR.` puis `Anyone can. This is the price.` |
| **Scène du tapis** | 316 | Tapis plein cadre, tas de NEAR dessous, étiquette `RUG PRICE {cost} NEAR` à la ficelle, main sur la frange, mascotte, Gap en petit |
| Dernier événement | 24 | Une ligne |
| Dock | 120 | `Buy` `Sell` `Rug it` et navigation |

Le titre et le prix sont fixes : ils ne bougent pas. Les 3 lignes d'explication sont sous le pli.

## 5. Mascotte vivante : le Tapis

Un petit tapis à franges, grands yeux ronds, jambes en caoutchouc, contour épais façon sticker, tissé du même motif que la page.

Un dessin maître découpé en **calques** (corps, franges, paupières, yeux, bouche, sueur) animés en CSS : clignements, yeux qui suivent le dernier échange, sueur en boucle, franges qui tremblent. Les calques composent **au moins 8 expressions** (dort, un œil ouvert, curieux, sueur, panique, hurle, arraché, fantôme). Pas de cycle de marche.

## 6. Le climax (pour tous les spectateurs, passable au toucher)

| t | Effet |
|---|---|
| 0 | La page se fige 200 ms. Silence. |
| 0,2 s | La main tire : la page entière se déforme et s'arrache avec un fouet de franges |
| 0,6 s | Le sol nu, écran `--rust`, le tas de NEAR à nu |
| 1,0 s | Le sac s'envole vers le nom ; le pot descend à 0, `+{pot} NEAR` monte |
| 2,0 s | L'affiche **WANTED** claque : `{account} STOLE {pot} NEAR`, tampon `ROUND {n}` |
| 3,2 s | Boutons `Share` et `Next round`, le tapis se redéroule du bord |

**Cela finit toujours sur quelqu'un de nommé.** `YOU RUGGED IT` pour le voleur, `Too slow. {bot} rugged round {n} first.` pour le perdant.

`prefers-reduced-motion` : fondu vers l'affiche statique.

## 7. L'image à partager : l'affiche WANTED

PNG 1080×1350 dessiné côté client sur canvas (Web Share fichiers, téléchargement en repli). Mugshot **déterministe**, dérivé du hash du compte : 12 voleurs masqués tissés, palette permutée, donc chaque compte a toujours le même visage. Les bots portent un tampon `BOT`. Le Mur des rugs est une rue couverte de ces affiches.

## 8. Inventaire d'assets

Abondant et cohérent : **chaque écran a au moins une image mémorable.** Toutes les images n'utilisent que la palette du §2.

| Famille | Assets |
|---|---|
| Tapis | Tapis maître pleine page (médaillon, bordures, franges) en haute définition ; versions de couleur pour chaque zone ; motifs tissés de crime crypto, en bandes et médaillons ; recto et revers |
| Sous le tapis | Tas de NEAR en 4 tailles selon le pot, poussière, sol nu, clous |
| Étiquette | Étiquette de marchand sur ficelle, tampons `RUGGED`, `NO ADMIN`, `SOLD`, `ZERO KEYS` |
| La Main | Une seule main géante, dessinée une fois, déplacée par translation |
| Mascotte | Dessin maître, calques, expressions du §5, poses pour les écrans vides et les erreurs |
| Voleurs | 12 mugshots masqués ; silhouette au sac de NEAR ; variantes pour le Mur et le partage |
| Mur des rugs | Gabarit WANTED, papier déchiré, mur de fond, ruban `BIGGEST HEIST` |
| Stickers et décor | Fleurs-yeux, sacs de monnaie, étoiles, éclats, clés barrées, damier tissé, séparateurs à franges, grain |
| Transitions | Le tapis qui se déroule d'une page à l'autre ; fouet de franges ; chargement (la mascotte respire) |
| Écrans | Illustration propre à chaque page : Log en rouleau de ticket tissé, Rules en acte notarié, Sim en tapisserie de 60 jours, Verify en loupe sur le tissage ; illustrations des états vides, course perdue, RPC en panne, bots endormis |
| Marque | Wordmark sur mesure « ANYONE CAN RUG » tissé, favicon, icône du token, image Open Graph, vignette vidéo |
| Vidéo | Générique, cartons et boucle de 6 s dans le même style |

Procédure : planche de référence pour fixer un personnage unique et une seule trame, puis déclinaisons ; assets sur fond transparent ; vérification de chaque planche à l'œil en 390×844 ; WebP/AVIF ; rien d'inutile dans `web/public/`. Aucun logo, marque ni personnage existant. Les outils de production restent hors du dépôt.

## 9. Vidéo

Master portrait, script dans `50-delivery.md` §6. Les 3 premières secondes : le tapis plein cadre, la cagnotte dessous, la main saisit puis tire, `ANYONE CAN STEAL THIS POT`. Un humain au centre : `Try it, no wallet`, maintien, `YOU RUGGED IT`, l'affiche. Fin sur la seconde tentative : `Too slow. bot-3 rugged round 12 first.`, puis « Bots probably win. It's in the README. »
