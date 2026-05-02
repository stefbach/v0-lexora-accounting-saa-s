# Workflow comptable — Maurice

Ce document décrit le workflow comptable mauricien implémenté dans Lexora,
depuis la saisie quotidienne jusqu'à la production des états financiers IFRS.

## 1. Référentiel applicable

Lexora applique simultanément :

- les **Mauritius Accounting Standards** (alignées sur les normes IFRS du
  IASB) ;
- l'**IFRS for SMEs** pour les PME éligibles selon les critères du _Companies
  Act 2001_ (article 211 — total bilan, CA, effectif) ;
- le **Plan Comptable Mauricien** (PCM) — codes à 4 ou 5 chiffres ;
- l'**Income Tax Act 1995** pour la fiscalité des sociétés (CIT) et des
  particuliers (PAYE) ;
- le **Value Added Tax Act 1998** pour la TVA ;
- le **Workers' Rights Act 2019** pour la paie et les indemnités.

## 2. Plan comptable (PCM)

| Classe | Nature                                | Exemples                       |
| ------ | ------------------------------------- | ------------------------------ |
| 1      | Capitaux propres et dettes long terme | 101 Capital, 164 Emprunts      |
| 2      | Immobilisations                       | 213 Constructions, 28 Amort.   |
| 3      | Stocks                                | 31 Matières, 37 Marchandises   |
| 4      | Tiers                                 | 401 Fournisseurs, 411 Clients  |
| 5      | Trésorerie                            | 512 Banques, 53 Caisses        |
| 6      | Charges                               | 60 Achats, 64 Personnel        |
| 7      | Produits                              | 70 Ventes, 76 Produits financ. |

Comptes spécifiques mauriciens :

- `4456 — VAT input (TVA déductible)`
- `4457 — VAT output (TVA collectée)`
- `4458 — VAT — déclaration en cours`
- `441 — PAYE Tax payable`
- `442 — NPS / NSF / CSG payable`

## 3. Cycle de saisie

```
[Pièce] → [Saisie / OCR] → [Imputation PCM] → [Validation] → [Lettrage]
                                                                  ↓
                                          [Balance → États financiers]
```

### 3.1 Pièces traitées

| Pièce                    | Journal      | Imputation type                    |
| ------------------------ | ------------ | ---------------------------------- |
| Facture vente            | VEN          | 411 / 706 + 4457                   |
| Facture achat            | ACH          | 401 / 60x + 4456                   |
| Encaissement client      | BNK          | 512 / 411                          |
| Décaissement fournisseur | BNK          | 401 / 512                          |
| Bulletin de paie         | PAI          | 641 / 421 / 441 / 442              |
| Opération diverse        | OD           | variable                           |

### 3.2 Validation

Toute pièce passe par les états : **Brouillon → Validé → Lettré**.
La validation verrouille les montants : seul un avoir ou une OD de correction
permet de modifier. Les écritures d'un exercice clos ne peuvent plus être
créées ni modifiées.

## 4. TVA mauricienne

### 4.1 Taux

- **15 %** : taux standard.
- **0 %** : exportations, biens essentiels listés en _Sixth Schedule_.
- **Exonéré** : services financiers, location résidentielle, santé.

### 4.2 Périodicité

- **Mensuelle** : CA annuel ≥ MUR 10 millions.
- **Trimestrielle** : CA annuel < MUR 10 millions.

Échéance : **20 du mois suivant** la fin de période.

### 4.3 Format MRA

Lexora génère :

1. le PDF du formulaire **VAT 4** ;
2. un fichier **XML** compatible portail _e-Tax_ ;
3. les justificatifs (livre des achats / des ventes) en cas de contrôle.

## 5. Paie

### 5.1 Charges sociales (employeur + salarié)

| Cotisation | Taux salarié | Taux employeur |
| ---------- | ------------ | -------------- |
| **NPS** (National Pensions Scheme) | 3 % | 6 % |
| **NSF** (National Savings Fund)    | 1 % | 2,5 % |
| **CSG** (Contribution Sociale Généralisée) | 1,5–3 % | 1,5–6 % |
| **HRDC Levy**                       | —    | 1,5 % de la masse salariale |
| **PAYE**                            | barème progressif (tax brackets) | — |

### 5.2 Provisions

- **PRGF** (Portable Retirement Gratuity Fund) : régime à cotisations
  définies, charge de l'exercice.
- **IAS 19** : engagements résiduels (gratification de retraite) → provision
  actuarielle, méthode des unités de crédit projetées (PUC).

## 6. Clôture d'exercice

L'exercice fiscal mauricien standard court du **1er juillet au 30 juin**.
Les sociétés peuvent opter pour un autre arrêté (31 décembre fréquemment).

### 6.1 Travaux d'inventaire

1. Inventaire physique des stocks → IAS 2 (coût ou VNR).
2. Dotations aux amortissements → IAS 16 / IAS 38.
3. Tests de dépréciation → IAS 36.
4. Provisions (IAS 37) : litiges, garanties, créances douteuses.
5. Engagements de retraite → IAS 19.
6. Réévaluation des positions en devises → IAS 21.
7. CCA / PCA, FNP / FAE.

### 6.2 Impôt sur les sociétés (CIT)

- **Taux standard** : 15 %.
- **Régime Global Business** (GBC 1) : 3 % sous conditions de substance.
- **Partial Exemption** : 80 % d'exemption sur certains revenus passifs.

L'impôt courant et l'impôt différé (IAS 12) sont comptabilisés à la clôture.

### 6.3 Production des états

Lexora produit automatiquement :

- **Statement of Financial Position** (Bilan)
- **Statement of Profit or Loss and Other Comprehensive Income**
- **Statement of Changes in Equity**
- **Statement of Cash Flows** (méthode indirecte)
- **Notes to the Financial Statements** (notes 1 à 30, conformes IFRS)

## 7. Conservation des archives

| Document                        | Durée | Source juridique            |
| ------------------------------- | ----- | --------------------------- |
| Pièces comptables               | 10 ans | Income Tax Act §96         |
| Déclarations TVA                | 10 ans | VAT Act §65                |
| Bulletins de paie               | 10 ans | Workers' Rights Act         |
| Contrats commerciaux            | 5 ans  | Code de commerce mauricien |
| États financiers signés         | 10 ans | Companies Act 2001         |

Les archives Lexora sont conservées au format PDF/A et SHA-256 horodaté pour
garantir leur intégrité en cas de contrôle.
