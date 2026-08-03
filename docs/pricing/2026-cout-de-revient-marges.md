# Prix de revient et marges — grille 2026

Modèle de coût des deux packages (`lib/pricing/packages.ts`, migration 467).
Objectif : savoir ce que coûte réellement un client avant de discuter du prix.

Taux retenu : **1 USD ≈ Rs 46**. Les tarifs API sont ceux affichés par les
fournisseurs ; les coûts humains sont des coûts chargés mauriciens.

---

## 1. Ce que le code consomme

Deux constats tirés du code, qui déterminent l'essentiel du coût variable :

| Constat | Où | Effet |
|---|---|---|
| Le modèle par défaut est **Sonnet 4.6** | `lib/claude.ts:18` | Coût token ×3 en entrée, ×3 en sortie vs Haiku 4.5 |
| **Aucun prompt caching** (`cache_control` absent du repo) | 37 fichiers appelant Claude | Les ~12 000 tokens de `lib/ai/prompts.ts` sont refacturés plein tarif à chaque appel |

C'est le levier de marge le plus important du produit, et il est intact.

### Coût IA par transaction

Une transaction traitée mobilise en moyenne 1 appel de classification /
génération d'écriture, plus ~0,5 appel d'agent de rapprochement. Soit environ
**7 000 tokens en entrée et 1 200 en sortie**.

| Configuration | Entrée | Sortie | $/tx | **Rs/tx** |
|---|---|---|---|---|
| Sonnet 4.6, sans cache — *situation actuelle* | $0,0210 | $0,0180 | $0,0390 | **1,79** |
| Sonnet 4.6 + prompt caching | $0,0075 | $0,0180 | $0,0255 | **1,17** |
| Haiku 4.5, sans cache | $0,0070 | $0,0060 | $0,0130 | **0,60** |
| Haiku 4.5 + prompt caching | $0,0025 | $0,0060 | $0,0085 | **0,39** |

Entre la configuration actuelle et la configuration optimisée : **facteur 4,6**.

### Autres postes

| Poste | Base | Montant |
|---|---|---|
| OCR Mistral | ~$1 / 1 000 pages, ~0,6 page par transaction | Rs 0,03 / tx — négligeable |
| Assistant, Telegram, alertes IA | ~150 messages/mois × (5 000 in + 700 out), Sonnet | Rs 90 à 530 / mois selon palier |
| Infrastructure fixe | Supabase Pro + compute $75, Vercel $60, Resend $20, n8n $20, monitoring $10 = **$185/mois ≈ Rs 8 510** | Rs 170 / client à 50 clients |
| Stockage | $0,021 / Go / mois + egress | Rs 5 à 200 / mois |
| Support humain | Rs 800/h chargé (comptable), Rs 1 500/h (expert IFRS/GBC) | Rs 240 à 7 500 / mois |

Le seuil de couverture de l'infrastructure est bas : **4 clients Croissance**
suffisent à payer toute la plateforme.

---

## 2. Marge par palier

Usage moyen retenu : **70 % du plafond de transactions** du palier.
Configuration IA : celle d'aujourd'hui (Sonnet sans cache), donc le cas
défavorable.

### Package Société

| Palier | Prix | IA tx | Assistant | Infra | Stockage | Support | **COGS** | **Marge** |
|---|---|---|---|---|---|---|---|---|
| Essentiel | 2 500 | 63 | 90 | 170 | 5 | 240 | **569** | **77 %** |
| Croissance | 4 900 | 251 | 176 | 170 | 20 | 400 | **1 021** | **79 %** |
| PME | 9 900 | 627 | 350 | 170 | 97 | 800 | **2 055** | **79 %** |
| Corporate | 18 900 | 1 880 | 530 | 170 | 200 | 1 600 | **4 412** | **77 %** |

### Package GBC / IFRS

| Palier | Prix | IA tx | Assistant | Infra | Stockage | Support expert | **COGS** | **Marge** |
|---|---|---|---|---|---|---|---|---|
| Authorised | 8 500 | 125 | 176 | 170 | 49 | 2 250 | **2 772** | **67 %** |
| Standard | 15 000 | 627 | 350 | 170 | 195 | 3 750 | **5 103** | **66 %** |
| Groupe | 32 000 | 1 880 | 530 | 400 | 300 | 7 500 | **10 642** | **67 %** |

La marge est **plate d'un palier à l'autre** : la grille est cohérente, aucun
palier ne subventionne les autres.

L'écart Société (≈ 78 %) / GBC (≈ 67 %) vient entièrement du **support
expert**, qui représente jusqu'à 70 % du COGS d'un palier GBC. C'est
structurel : la scalabilité du GBC passe par l'outillage du support, pas par
une hausse de prix.

### Effet du passage à Haiku + prompt caching

| Palier | COGS actuel | COGS optimisé | Marge actuelle | **Marge optimisée** |
|---|---|---|---|---|
| Essentiel | 569 | 450 | 77 % | **82 %** |
| Croissance | 1 021 | 687 | 79 % | **86 %** |
| PME | 2 055 | 1 291 | 79 % | **87 %** |
| Corporate | 4 412 | 2 527 | 77 % | **87 %** |

**+7 à +10 points de marge brute sans toucher au prix de vente.**

---

## 3. Postes hors abonnement

### Dépassement — Rs 15 / transaction

Coût marginal réel : Rs 1,79. Marge **88 %**. Le plafonnement à l'écart avec
le palier supérieur empêche que ce poste devienne une rente : au-delà, le
client a mécaniquement intérêt à monter de palier, ce qui est le comportement
recherché.

### TIBOK — Rs 500 / téléconsultation

C'est le seul poste dont je **ne connais pas le prix de revient** : il dépend
du contrat d'achat avec TIBOK, qui n'est pas dans le repo.

| Prix d'achat de la consultation | Marge |
|---|---|
| Rs 300 | 40 % |
| Rs 400 | 20 % |
| Rs 500 | 0 % |
| > Rs 500 | perte à chaque acte |

**À verrouiller avant d'annoncer Rs 500** : le prix de vente doit être indexé
sur le prix d'achat, pas fixé indépendamment. Le passage à l'acte a déjà
supprimé le risque majeur (l'ancien forfait à Rs 1 200/mois exposait à une
perte non bornée) ; il reste à sécuriser le taux.

### Frais de mise en service — Rs 8 000 pour 4 h

| Poste | Temps | Coût |
|---|---|---|
| Formation | 4 h × Rs 800 | 3 200 |
| Paramétrage société (plan comptable, exercices, utilisateurs, connexion bancaire) | 2 h × Rs 800 | 1 600 |
| **Total** | 6 h | **4 800** |

Marge Rs 3 200, soit **40 %**. Le montant est correct — il couvre le temps
engagé sans être un centre de profit, ce qui est le bon calibrage pour un
frais dont la fonction réelle est de financer l'onboarding et de filtrer les
souscriptions non sérieuses.

Deux réserves, dans l'ordre d'importance :

**La reprise d'historique n'entre pas dans les 4 h.** Importer une balance
d'ouverture, un plan comptable existant et un parc de 40 salariés représente
6 à 12 h. Non devisée séparément, elle transforme un frais à +Rs 3 200 en un
frais à −Rs 5 000 sur chaque PME signée. C'est la seule façon dont ce poste
peut devenir négatif, et elle est probable si rien n'est dit au client.

**Point mort d'acquisition sur Essentiel.** Rs 8 000 représentent 3,2 mois
d'abonnement à sortir avant la première utilisation, sur le palier où le
prospect est le plus sensible au prix. Si le taux de transformation de ce
palier déçoit, c'est le premier paramètre à bouger : offert en engagement
annuel, ou ramené à Rs 4 000 sur Essentiel uniquement. Les paliers supérieurs
absorbent les Rs 8 000 sans difficulté.

---

## 4. Actions classées par gain

1. **Router sur Haiku 4.5 et activer le prompt caching.** Ni l'un ni l'autre
   n'est fait aujourd'hui. +7 à +10 points de marge brute sur tout le parc,
   sans changement de prix ni de périmètre.
2. **Verrouiller le prix d'achat TIBOK** avant que Rs 500 soit annoncé
   publiquement.
3. **Deviser la reprise d'historique à part** du frais de mise en service.
4. **Outiller le support GBC** — c'est lui, et non le coût technique, qui
   tient la marge de ce package 11 points sous celle du Package Société.

---

## Hypothèses à revalider

Ce modèle est aussi bon que ses hypothèses. Celles qui méritent une mesure
réelle plutôt qu'une estimation :

- 7 000 tokens en entrée / 1 200 en sortie par transaction — à instrumenter
  sur le parc réel, c'est le paramètre le plus sensible ;
- 70 % d'usage du plafond en moyenne ;
- temps de support par palier — la fourchette 0,3 h à 5 h est une estimation,
  pas une mesure ;
- prix d'achat TIBOK — inconnu à ce jour ;
- 50 clients pour l'amortissement de l'infrastructure.
