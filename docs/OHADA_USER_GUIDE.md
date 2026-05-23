# Guide Utilisateur - OHADA SYSCOHADA dans Lexora

## Introduction

### Qu'est-ce que OHADA et SYSCOHADA ?

L'**OHADA** (Organisation pour l'Harmonisation en Afrique du Droit des Affaires) est un traité international signé en 1993 à Port-Louis (Maurice) par 17 États africains. Son objectif est d'harmoniser le droit des affaires afin de favoriser l'investissement et la sécurité juridique sur le continent.

Le **SYSCOHADA** (Système Comptable OHADA) est le référentiel comptable issu de l'Acte Uniforme relatif au Droit Comptable et à l'Information Financière (**AUDCIF**), révisé en 2017. Il définit le Plan Comptable Général, les états financiers obligatoires (Bilan, Compte de Résultat, TAFIRE, Notes Annexes) ainsi que les règles d'évaluation et de présentation des comptes.

### Différence avec PCM Maurice (Plan Comptable Mauricien)

| Critère | SYSCOHADA | PCM Maurice |
|---|---|---|
| Nombre de classes | 9 classes | 7 classes |
| Classe 8 | HAO (Hors Activités Ordinaires) | Inexistante |
| Classe 9 | Comptabilité Analytique | Inexistante |
| Résultat Net | Code XI | Libellé direct |
| Valeur Ajoutée | Solde intermédiaire XC | Non standardisé |
| TAFIRE | Tableau de financement obligatoire | Non requis |
| Monnaie de référence | XOF / XAF / autres | MUR |

### Les 17 pays OHADA + Maurice

Les **17 États membres OHADA** actuels sont :

- **Zone UEMOA** (XOF) : Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Niger, Guinée-Bissau, Togo, Bénin
- **Zone CEMAC** (XAF) : Cameroun, Gabon, Congo, Tchad, Centrafrique, Guinée Équatoriale
- **Autres** : Comores (KMF), République Démocratique du Congo (CDF), Guinée (GNF)

**Maurice** n'est pas membre OHADA mais Lexora supporte nativement son Plan Comptable Mauricien (PCM) en parallèle.

---

## Démarrage Rapide

### Comment créer une nouvelle société OHADA

1. Depuis le tableau de bord Lexora, cliquez sur **"Nouvelle Société"**
2. Sélectionnez le régime comptable **SYSCOHADA**
3. Renseignez la raison sociale, le numéro RCCM et le NIU/NIF selon le pays
4. Cliquez sur **"Créer"**

### Sélection du pays

Le choix du pays détermine automatiquement :
- La devise comptable (XOF, XAF, KMF, CDF, GNF)
- Les taux de TVA applicables
- Le barème d'imposition sur le revenu (IUTS, IRPP, ITS)
- La caisse de sécurité sociale (CNSS, CNPS, IPRES)
- Le calendrier des échéances fiscales

### Configuration initiale

Après création de la société, configurez :
- **Exercice fiscal** : généralement du 1er janvier au 31 décembre (modifiable selon votre statut)
- **Devise principale** : sélectionnée automatiquement selon le pays
- **Régime d'imposition** : Réel Normal, Réel Simplifié ou SMT (Système Minimal de Trésorerie)
- **Seuil de TVA** : assujetti ou non-assujetti selon votre chiffre d'affaires

### Import du plan comptable

Lexora importe automatiquement le **Plan Comptable SYSCOHADA standard** à la création de la société. Vous pouvez également :

1. Aller dans **Paramètres > Plan Comptable**
2. Cliquer sur **"Importer"**
3. Choisir le format (Excel .xlsx ou CSV)
4. Mapper les colonnes (Numéro, Libellé, Classe, Type)

---

## Plan Comptable SYSCOHADA

### Les 9 classes

| Classe | Intitulé | Exemples |
|---|---|---|
| **1** | Ressources durables (Capitaux) | Capital social, Emprunts LT |
| **2** | Actif immobilisé | Terrains, Matériels, Brevets |
| **3** | Stocks | Marchandises, MP, En-cours |
| **4** | Tiers | Fournisseurs, Clients, État |
| **5** | Trésorerie | Banques, Caisses, Chèques |
| **6** | Charges des activités ordinaires | Achats, Charges personnel |
| **7** | Produits des activités ordinaires | Ventes, Produits accessoires |
| **8** | Charges et produits HAO | Cessions d'actifs, éléments exceptionnels |
| **9** | Comptabilité analytique | Centres de coûts, Sections |

### Comptes obligatoires par classe

- **Classe 1** : 101 (Capital), 106 (Réserves), 12 (Report à nouveau), 13 (Résultat net)
- **Classe 2** : 21 (Immobilisations corporelles), 28 (Amortissements)
- **Classe 3** : 31 (Marchandises), 38 (Stocks en voie d'acheminement)
- **Classe 4** : 401 (Fournisseurs), 411 (Clients), 441 (État - TVA), 421 (Personnel)
- **Classe 5** : 521 (Banques), 571 (Caisse)
- **Classe 6** : 601 (Achats marchandises), 641 (Rémunérations personnel)
- **Classe 7** : 701 (Ventes marchandises), 706 (Services vendus)
- **Classe 8** : 81 (Valeurs comptables des cessions), 82 (Produits des cessions)

### Comment ajouter des comptes personnalisés

1. Allez dans **Paramètres > Plan Comptable > Nouveau Compte**
2. Saisissez un numéro à 3 chiffres minimum respectant la classe concernée
3. Définissez le libellé, le type (Actif/Passif/Charge/Produit) et le sens normal (Débit/Crédit)
4. Les comptes personnalisés doivent être des **sous-comptes** d'un compte de regroupement existant (ex : 4011 pour Fournisseurs locaux)

### Mapping avec PCM Maurice

Pour les sociétés ayant des opérations à Maurice et dans la zone OHADA, Lexora propose un tableau de correspondance :

| PCM Maurice | SYSCOHADA | Description |
|---|---|---|
| 2000-2999 | 21-28 | Immobilisations |
| 3000-3999 | 31-38 | Stocks |
| 4000-4999 | 40-49 | Tiers |
| 5000-5999 | 50-59 | Trésorerie |
| 6000-6999 | 60-69 | Charges |
| 7000-7999 | 70-79 | Produits |

---

## Écritures Comptables

### Création d'une écriture

Dans **Comptabilité > Saisie**, sélectionnez le journal puis renseignez :
- **Date** de l'opération
- **Libellé** descriptif
- **Débit / Crédit** sur les comptes concernés
- **Pièce justificative** (numéro de facture, reçu)

### Validation double-entrée (R1)

Lexora applique automatiquement la règle **R1 (équilibre débit/crédit)**. Une écriture ne peut être validée que si `Σ Débit = Σ Crédit`. Tout écart bloque la saisie avec un message d'erreur explicite.

### Codes journaux

| Code | Journal | Usage |
|---|---|---|
| **VTE** | Ventes | Factures clients, avoirs |
| **ACH** | Achats | Factures fournisseurs |
| **BNQ** | Banque | Mouvements bancaires |
| **CAI** | Caisse | Encaissements/décaissements espèces |
| **SAL** | Salaires | Bulletins de paie, cotisations |
| **OD** | Opérations Diverses | Amortissements, provisions, régularisations |
| **HAO** | Hors Activités Ordinaires | Cessions, éléments exceptionnels |

### Lettrage et rapprochement

- **Lettrage** : associez les débits et crédits d'un même tiers (ex : facture 411 vs règlement 521) dans **Tiers > Lettrage**
- **Rapprochement bancaire** : importez votre relevé bancaire (CSV, OFX) dans **Banque > Rapprochement** pour valider les écritures BNQ

---

## Fiscalité par Pays

### Sénégal

| Impôt/Taxe | Taux | Base |
|---|---|---|
| TVA | 18% | CA taxable |
| IS (Impôt sur les Sociétés) | 30% | Résultat fiscal |
| IRPP / IUTS | Barème progressif | Salaire imposable |
| CMF (Contribution Minimale Forfaitaire) | 0,5% CA | Si IS < CMF |

**Déclarations et échéances :**
- TVA mensuelle : 15 du mois suivant (ou trimestrielle si CA < 100M XOF)
- IS : déclaration annuelle au 30 avril, acomptes trimestriels (15 mars, 15 juin, 15 sept, 15 déc)
- Déclaration employeur (IUTS) : mensuelle, 15 du mois suivant

### Côte d'Ivoire

| Impôt/Taxe | Taux | Base |
|---|---|---|
| TVA standard | 18% | CA taxable |
| TVA réduit | 9% | Produits de grande consommation |
| IS | 25% | Résultat fiscal |
| IMF (Impôt Minimum Forfaitaire) | 0,5% CA | Si IS < IMF |
| IRPP | Barème progressif | Revenu imposable |

**Déclarations DGI :**
- TVA : déclaration mensuelle, 10 du mois suivant
- IS : déclaration annuelle, 30 jours après l'AG
- Acomptes IS : avril et septembre

### Cameroun

| Impôt/Taxe | Taux HT | Avec CAC 10% | Effectif |
|---|---|---|---|
| TVA | 17,5% | +CAC 10% | **19,25%** |
| IS | 30% | +CAC 10% | **33%** |
| IRCM | 16,5% | +CAC 10% | **18,15%** |

**Particularité CAC (Centimes Additionnels Communaux) :** Au Cameroun, tous les taux incluent une surtaxe communale de 10%. Le taux affiché dans Lexora pour la TVA est donc **19,25%** (17,5% × 1,1).

**Déclarations DGI :**
- TVA mensuelle : avant le 15 du mois suivant
- IS : déclaration annuelle avant le 15 mars (ou 3 mois après clôture)
- Acomptes IS : avant le 15 mars, 15 juin, 15 septembre

### Autres pays (tableau résumé)

| Pays | Devise | TVA | IS | Spécificités |
|---|---|---|---|---|
| Mali | XOF | 18% | 30% | CMF 0,5% |
| Burkina Faso | XOF | 18% | 27,5% | IMF 1% |
| Niger | XOF | 19% | 30% | CMF variable |
| Togo | XOF | 18% | 27% | Patente annuelle |
| Bénin | XOF | 18% | 30% | CMF 1% |
| Guinée-Bissau | XOF | 19% | 25% | — |
| Gabon | XAF | 18% | 30% | Taxe spéciale 10% |
| Congo | XAF | 18% | 28% | TVA pharmacie 5% |
| Tchad | XAF | 18% | 35% | — |
| Centrafrique | XAF | 19% | 30% | — |
| Guinée Équatoriale | XAF | 15% | 25% | — |
| Comores | KMF | 10% | 35% | — |
| RDC | CDF | 16% | 30% | IBIF retenue |
| Guinée | GNF | 18% | 25% | TAF 5% sur IS |

---

## Paie OHADA

### Calcul du salaire brut → net

La paie dans Lexora suit la cascade OHADA standard :

```
Salaire de Base
+ Indemnités imposables (logement, transport taxable)
= Salaire Brut Imposable

- Part salariale CNSS/CNPS/IPRES
- Part salariale retraite complémentaire
= Salaire Brut Taxable

- Abattements légaux (20% forfaitaire Sénégal, variable selon pays)
= Revenu Net Imposable

× Barème IUTS/IRPP/ITS
= Impôt sur le revenu salarial

Salaire Brut - Cotisations salariales - Impôt = SALAIRE NET À PAYER
```

### Cotisations sociales par pays

| Pays | Organisme | Part salariale | Part patronale |
|---|---|---|---|
| Sénégal | IPRES (retraite) | 5,6% | 8,4% |
| Sénégal | CSS (prévoyance) | — | 3% à 7% |
| Côte d'Ivoire | CNPS | 6,3% | 14,7% |
| Cameroun | CNPS | 2,8% | 11,2% |
| Mali | INPS | 3,6% | 11,1% |
| Gabon | CNSS | 2,5% | 20,1% |

### Impôt sur le revenu salarial

- **Sénégal** : IUTS (Impôt Unique sur les Traitements et Salaires), barème progressif de 0% à 40%
- **Côte d'Ivoire** : IGR (Impôt Général sur le Revenu), barème de 0% à 36%
- **Cameroun** : IRPP avec CSI, barème de 10% à 38,5% + CAC 10%
- **Gabon** : IRPP, barème de 5% à 35%

Lexora calcule automatiquement l'impôt selon le barème en vigueur du pays sélectionné.

### Prestations familiales

Les allocations familiales sont versées par l'organisme de sécurité sociale selon le nombre d'enfants à charge. Lexora intègre les barèmes CNPS/CNSS pour le calcul automatique.

### Indemnités de départ (Severance)

Le calcul de l'indemnité de licenciement respecte le Code du Travail local :
- **Base** : moyenne des 12 derniers salaires bruts
- **Calcul** : selon l'ancienneté (généralement 1 mois par année, avec taux progressif)
- **Exonération fiscale** : plafond variable selon le pays (souvent 1 ou 2 fois la limite légale)

### Bulletins de paie

Les bulletins de paie sont générés au **format local** (PDF) avec :
- En-tête société + salarié + période
- Détail brut/cotisations/impôt/net
- Mentions légales obligatoires (RCCM, NIU)
- Code QR de vérification

---

## États Financiers

### Bilan SYSCOHADA

Le Bilan SYSCOHADA est structuré en **postes codifiés** selon l'AUDCIF 2017 :

**ACTIF :**
| Code | Poste |
|---|---|
| AD | Charges immobilisées |
| AE-AH | Immobilisations incorporelles |
| AI-AN | Immobilisations corporelles |
| AO-AQ | Immobilisations financières |
| AR-AZ | Total Actif Immobilisé |
| BA-BH | Actif Circulant HAO |
| BI-BQ | Stocks |
| BR-BZ | Créances et emplois assimilés |
| CA-CZ | Trésorerie Actif |
| DV | Total Actif |

**PASSIF :**
| Code | Poste |
|---|---|
| CA | Capital |
| CB-CF | Réserves et Report |
| CG | Résultat Net |
| CH-CP | Autres capitaux propres |
| DA-DG | Dettes financières LT |
| DH-DQ | Passif Circulant |
| DR-DT | Trésorerie Passif |
| DV | Total Passif |

Le bilan inclut automatiquement la **comparaison N-1** sur deux colonnes.

### Compte de Résultat - Soldes Intermédiaires de Gestion

| Code SIG | Intitulé | Calcul |
|---|---|---|
| **XA** | Marge Commerciale | Ventes marchandises - Coût d'achat |
| **XB** | Chiffre d'Affaires | XA + Ventes produits fabriqués + Services |
| **XC** | Valeur Ajoutée | XB - Consommations intermédiaires |
| **XD** | Excédent Brut d'Exploitation (EBE) | XC - Charges de personnel + Subventions |
| **XE** | Résultat d'Exploitation | XD ± Dotations/Reprises ± Autres produits/charges |
| **XF** | Résultat Financier | Produits financiers - Charges financières |
| **XG** | Résultat des Activités Ordinaires (RAO) | XE + XF |
| **XH** | Résultat Hors Activités Ordinaires (HAO) | Produits HAO - Charges HAO |
| **XI** | Résultat Net | XG + XH - IS |

### TAFIRE (Tableau de Financement des Ressources et Emplois)

Le TAFIRE est **obligatoire** pour le Système Normal SYSCOHADA. Il comprend :

**CAFG (Capacité d'Autofinancement Globale) :**
- Résultat Net + Dotations aux amortissements et provisions
- - Reprises sur provisions + VNC des cessions
- - Produits des cessions

**Variation du Fonds de Roulement (FdR) :**
- Augmentations de capitaux permanents - Investissements nets
- = Variation ressources durables

**Variation du Besoin en Fonds d'Exploitation (BFE) :**
- Variation stocks + Variation créances - Variation dettes d'exploitation
- = Besoins ou dégagement de BFE

**Variation de Trésorerie :**
- FdR - BFE = Variation nette de trésorerie
- Trésorerie initiale + Variation = Trésorerie finale (doit correspondre au bilan)

### Notes Annexes (Système Normal)

Le Système Normal SYSCOHADA comprend **35 notes obligatoires**, dont :
- Note 1 : Principales méthodes d'évaluation
- Note 2 : Immobilisations (mouvements de l'exercice)
- Note 3 : Amortissements (dotations et cumul)
- Note 4 : Provisions (constitution et reprise)
- Note 5 : Tableau des échéances des créances et dettes
- Notes 6-15 : Détail des postes du bilan
- Notes 16-25 : Détail du compte de résultat
- Notes 26-35 : Engagements hors bilan, événements post-clôture, etc.

Lexora génère automatiquement les notes à partir des données saisies.

### Système Minimal de Trésorerie (SMT)

Le SMT est réservé aux **très petites entreprises** dont le chiffre d'affaires est inférieur à **60 millions XOF** (ou équivalent). Il se compose de :

- **Livre de Recettes-Dépenses** : enregistrement chronologique des encaissements et décaissements
- **Situation de Trésorerie** : soldes de caisse et banque en fin de période
- **État du Patrimoine Simplifié** : actifs et dettes à la date de clôture

Pour activer le SMT dans Lexora : **Paramètres > Régime Comptable > SMT**.

---

## Multi-Devises

### Devises pegées à l'Euro (cours fixe)

| Devise | Zone | Parité EUR |
|---|---|---|
| XOF (Franc CFA UEMOA) | 8 pays UEMOA | 1 EUR = 655,957 XOF |
| XAF (Franc CFA CEMAC) | 6 pays CEMAC | 1 EUR = 655,957 XAF |
| KMF (Franc Comorien) | Comores | 1 EUR = 491,967 KMF |

Ces devises n'engendrent **pas d'écarts de change** entre elles tant que le peg est maintenu.

### Devises flottantes

| Devise | Zone | Volatilité |
|---|---|---|
| CDF (Franc Congolais) | RDC | Haute |
| GNF (Franc Guinéen) | Guinée | Haute |
| MUR (Roupie Mauricienne) | Maurice | Modérée |

### Conversion automatique

Lexora récupère les **cours de change du jour** via une API de référence (BCEAO, BEAC ou Banque Centrale locale). Pour chaque transaction en devise étrangère :
1. Le montant est converti en devise fonctionnelle au taux du jour de l'opération
2. Le cours utilisé est enregistré dans la pièce comptable

### Comptabilisation des écarts de change

À la clôture, Lexora recalcule les **positions en devises** et génère automatiquement les écritures d'écart :
- **Gain de change** → Compte 776 (Gains de change)
- **Perte de change** → Compte 676 (Pertes de change)
- **Provision pour perte latente** → Compte 194 (Provision risque de change) via OD

---

## Audit et Conformité

### Audit trail immuable

Chaque opération dans Lexora génère un **enregistrement immuable** horodaté incluant :
- Identifiant utilisateur, date et heure (UTC)
- Adresse IP et appareil
- Données avant et après modification
- Hash cryptographique de la séquence (chaîne SHA-256)

Les journaux d'audit sont **non modifiables** par les utilisateurs, y compris les administrateurs.

### Ségrégation des tâches (SoD)

Lexora applique le principe de **Segregation of Duties** :
- Le **comptable** saisit les écritures
- Le **responsable comptable** valide et lettrage
- Le **directeur financier** approuve les révisions et clôtures
- L'**auditeur externe** accède en lecture seule avec export complet

Les droits sont configurables dans **Paramètres > Utilisateurs & Rôles**.

### Conformité AUDCIF 2017

Lexora respecte intégralement l'Acte Uniforme OHADA relatif au Droit Comptable (AUDCIF) révisé en 2017 :
- Plan de comptes conforme
- États financiers aux formats officiels
- Méthodes d'évaluation (coût historique, juste valeur)
- Règles de consolidation pour groupes

### Préparation audit Big 4

Pour préparer un audit (Deloitte, PwC, EY, KPMG), Lexora fournit :
- Balance générale détaillée (grand livre)
- Grands livres par compte avec lettrage
- Fichier des Écritures Comptables (FEC) au format standard
- Rapprochements bancaires validés
- Tableau des immobilisations et amortissements
- État des créances et dettes avec échéancier

---

## Intégrations

### Telegram Bot

Le bot Lexora sur Telegram permet :
- Soumettre une **note de frais** (photo de reçu → OCR → écriture prévalidée)
- Recevoir des **alertes fiscales** (rappel d'échéance TVA, IS)
- Consulter le **solde de trésorerie** en temps réel
- Approuver des écritures depuis mobile

Configuration : **Paramètres > Intégrations > Telegram**, entrez votre `BOT_TOKEN`.

### n8n Workflows

Lexora expose des webhooks compatibles n8n pour automatiser :
- Import automatique des relevés bancaires
- Synchronisation avec votre CRM (factures clients)
- Envoi de bulletins de paie par email
- Alertes Slack/Teams sur événements comptables

Les templates n8n sont disponibles dans `/docs/n8n/`.

### API REST publique

Lexora dispose d'une **API REST complète** (OpenAPI 3.0) documentée dans `/docs/API.md` :
- Authentification Bearer JWT
- Endpoints : `/transactions`, `/accounts`, `/reports`, `/payroll`
- Rate limit : 1000 req/min par clé API
- Webhooks entrants/sortants

### Export Excel / PDF

Depuis n'importe quel état financier :
- **Excel (.xlsx)** : données brutes avec formules recalculables
- **PDF** : mise en page officielle avec entête société et signature numérique
- **CSV** : pour import dans d'autres outils (Sage, Cegid, etc.)

---

## Questions Fréquentes (FAQ)

### Q : Quelle différence entre PCM (Maurice) et SYSCOHADA ?

**R :** SYSCOHADA comporte 9 classes de comptes contre 7 pour le PCM mauricien. Les classes 8 (Hors Activités Ordinaires) et 9 (Comptabilité Analytique) sont spécifiques au SYSCOHADA. La numérotation des comptes et la structure des états financiers sont différentes : le SYSCOHADA utilise des codes standardisés (XA à XI pour les SIG, AD à DV pour le bilan) qui n'existent pas dans le PCM mauricien.

### Q : Comment migrer depuis Sage Saari Compta ou Sage 100 ?

**R :** Lexora supporte l'import de balances depuis Sage et d'autres logiciels. Procédure :
1. Exportez votre balance générale depuis Sage au format Excel ou CSV
2. Dans Lexora : **Paramètres > Import > Balance Sage**
3. Mappez les colonnes (compte, libellé, débit, crédit)
4. Vérifiez les doublons et validez

Pour une migration complète d'historique, contactez l'équipe support.

### Q : Quelle devise pour ma société ?

**R :** La devise est déterminée par le pays du siège social :
- **Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Niger, Togo, Bénin, Guinée-Bissau** (UEMOA) → **XOF**
- **Cameroun, Gabon, Congo, Tchad, Centrafrique, Guinée Équatoriale** (CEMAC) → **XAF**
- **Comores** → **KMF**
- **République Démocratique du Congo** → **CDF**
- **Guinée** → **GNF**
- **Maurice** → **MUR**

### Q : Lexora est-il certifié pour audit Big 4 ?

**R :** Oui. Lexora respecte tous les standards **AUDCIF 2017**, maintient un audit trail conforme aux exigences **SOX 404** (traçabilité, immuabilité, ségrégation des tâches) et produit les fichiers nécessaires à un audit Big 4 (FEC, grands livres, rapprochements). Des missions d'audit ont été réalisées avec succès chez des clients Lexora par des cabinets membres des Big 4.

### Q : Comment gérer les sociétés multi-pays dans Lexora ?

**R :** Lexora supporte la gestion **multi-entités** depuis un tableau de bord unique. Chaque société a son propre plan comptable, ses taux fiscaux et sa devise. Vous pouvez basculer entre sociétés via le sélecteur en haut à droite.

### Q : Le TAFIRE est-il obligatoire pour toutes les sociétés ?

**R :** Le TAFIRE est obligatoire pour les sociétés relevant du **Système Normal** (SA, SARL dépassant les seuils). Les PME sous le **Système Allégé** produisent un tableau simplifié. Les TPE sous le **SMT** (CA < 60M XOF) sont dispensées du TAFIRE.

---

## Support

- **Documentation technique** : `/docs/OHADA_ARCHITECTURE.md`
- **Référence API** : `/docs/API.md`
- **Schéma JSON des transactions** : `/docs/TX_JSON_SCHEMA.md`
- **Taux historiques** : `/docs/RATES_HISTORICAL.md`
- **Email support** : support@lexora.app
- **Base de connaissances** : https://help.lexora.app

---

*Document généré pour Lexora v2.x — Conforme AUDCIF 2017 — Dernière mise à jour : mai 2026*
