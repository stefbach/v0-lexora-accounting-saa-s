# Architecture Multi-Juridictions OHADA - Lexora

## 1. Vue d'Ensemble

Lexora est une solution de comptabilité SaaS conçue nativement pour couvrir l'espace juridique OHADA ainsi que Maurice. L'objectif est de proposer un moteur comptable unique, extensible et certifiable qui gère simultanément plusieurs entités juridiques dans des pays différents, chacune avec ses propres obligations fiscales, sociales et comptables.

**Périmètre fonctionnel :**

| Dimension | Valeur |
|---|---|
| Pays couverts | 17 États membres OHADA + Maurice |
| Standard OHADA | SYSCOHADA Révisé – AUDCIF 2017 |
| Standard Maurice | Plan Comptable Mauricien (PCM) |
| Devises natives | XOF, XAF, KMF, CDF, GNF, MUR |
| Devises de référence | EUR, USD, GBP |
| Comptes SYSCOHADA | 200+ comptes, 9 classes |
| États financiers | Bilan, Compte de résultat, TAFIRE, 35 Notes annexes, SMT |

**Textes de référence :**
- Acte Uniforme relatif au Droit Comptable et à l'Information Financière (AUDCIF), adopté le 26 janvier 2017, entré en vigueur le 1er janvier 2018
- SYSCOHADA Révisé (guide d'application OHADA)
- Codes des impôts nationaux de chaque État membre

---

## 2. Pays Supportés

### Tableau des 18 juridictions

| Code ISO | Pays | Zone | Devise | TVA standard | IS | Statut |
|---|---|---|---|---|---|---|
| **SN** | Sénégal | UEMOA | XOF | 18 % | 30 % | Actif |
| **CI** | Côte d'Ivoire | UEMOA | XOF | 18 % | 25 % | Actif |
| **ML** | Mali | UEMOA | XOF | 18 % | 30 % | Actif |
| **BF** | Burkina Faso | UEMOA | XOF | 18 % | 27,5 % | Actif |
| **NE** | Niger | UEMOA | XOF | 19 % | 30 % | Actif |
| **BJ** | Bénin | UEMOA | XOF | 18 % | 30 % | Actif |
| **TG** | Togo | UEMOA | XOF | 18 % | 27 % | Actif |
| **GW** | Guinée-Bissau | UEMOA | XOF | 15 % | 25 % | Actif |
| **CM** | Cameroun | CEMAC | XAF | 19,25 % (TVA 17,5 % + CAC 10 %) | 33 % (IS 30 % + CAC) | Actif |
| **GA** | Gabon | CEMAC | XAF | 18 % | 30 % | Actif |
| **CG** | Congo (Brazzaville) | CEMAC | XAF | 18,9 % | 30 % | Actif |
| **TD** | Tchad | CEMAC | XAF | 18 % | 35 % | Actif |
| **CF** | Centrafrique | CEMAC | XAF | 19 % | 30 % | Actif |
| **GQ** | Guinée Équatoriale | CEMAC | XAF | 15 % | 35 % | Actif |
| **KM** | Comores | Autre | KMF | 10 % | 35 % | Actif |
| **CD** | RD Congo | Autre | CDF | 16 % | 30 % | Actif |
| **GN** | Guinée (Conakry) | Autre | GNF | 18 % | 25 % | Actif |
| **MU** | Maurice | Hors OHADA | MUR | 15 % | 15 % | Actif |

### Zones monétaires et taux de change

| Devise | Nom complet | Zone | Rattachement EUR | Décimales |
|---|---|---|---|---|
| XOF | Franc CFA UEMOA | UEMOA (8 pays) | 1 EUR = 655,957 XOF (fixe) | 0 |
| XAF | Franc CFA CEMAC | CEMAC (6 pays) | 1 EUR = 655,957 XAF (fixe) | 0 |
| KMF | Franc Comorien | Comores | 1 EUR = 491,968 KMF (fixe) | 0 |
| CDF | Franc Congolais | RDC | Flottant | 2 |
| GNF | Franc Guinéen | Guinée | Flottant | 0 |
| MUR | Roupie Mauricienne | Maurice | Flottant | 2 |

---

## 3. Architecture Logicielle

### Structure des répertoires

```
/lib/jurisdictions/
├── core/                          # Interfaces et types partagés
│   ├── jurisdiction.interface.ts  # Interface principale Jurisdiction
│   ├── chart-of-accounts.interface.ts
│   ├── tax-engine.interface.ts
│   ├── payroll-engine.interface.ts
│   ├── financial-statements.interface.ts
│   ├── registry.ts                # Registry central
│   └── types.ts                   # JurisdictionCode, CurrencyCode, etc.
├── ohada/                         # Implémentation SYSCOHADA
│   ├── chart-of-accounts.ts       # Plan comptable SYSCOHADA complet
│   ├── currencies.ts              # Devises OHADA + convertisseur
│   ├── classes/                   # 9 classes SYSCOHADA
│   │   ├── classe-1-ressources-durables.ts
│   │   ├── classe-2-actif-immobilise.ts
│   │   ├── classe-3-stocks.ts
│   │   ├── classe-4-tiers.ts
│   │   ├── classe-5-tresorerie.ts
│   │   ├── classe-6-charges.ts
│   │   ├── classe-7-produits.ts
│   │   ├── classe-8-hao.ts
│   │   └── classe-9-analytique.ts
│   ├── tax/
│   │   └── base-tax-engine.ts     # Moteur fiscal OHADA abstrait
│   ├── payroll/
│   │   └── base-payroll-engine.ts # Moteur paie OHADA abstrait
│   ├── statements/
│   │   ├── bilan.ts               # Bilan SYSCOHADA
│   │   ├── compte-resultat.ts     # Compte de résultat
│   │   ├── tafire.ts              # TAFIRE
│   │   ├── notes-annexes.ts       # 35 notes obligatoires
│   │   └── systeme-minimal-tresorerie.ts  # Système SMT (TPE)
│   └── countries/                 # Configurations par pays
│       ├── senegal/
│       │   ├── tax-config.ts
│       │   └── payroll-config.ts
│       ├── ivory-coast/
│       ├── cameroon/
│       └── ... (17 pays)
```

### Interfaces core

**Interface `Jurisdiction`** — contrat principal que chaque juridiction doit implémenter :

```typescript
interface Jurisdiction {
  readonly config: JurisdictionConfig        // Métadonnées (code, devise, TVA…)
  readonly chartOfAccounts: ChartOfAccountsProvider
  readonly taxEngine: TaxEngine
  readonly payrollEngine: PayrollEngine
  readonly statementsProvider: FinancialStatementsProvider

  validateJournalEntry(entry: JournalEntry): ValidationResult
  getAccount(accountNumber: string): Account | undefined
  getCurrentFiscalPeriod(asOf?: Date): FiscalPeriod
  isAccountReconcilable(accountNumber: string): boolean
  formatAmount(amount: number): string
  formatDate(date: Date): string
}
```

**Interface `TaxEngine`** — obligations fiscales (TVA, IS, retenues à la source, IUTS/IRPP) :
- `getVatRates()` / `calculateVat(amount, vatCode)`
- `calculateCorporateIncomeTax(taxableIncome, fiscalYear)`
- `calculateWithholdingTax(amount, beneficiaryType, country?)`
- `getRequiredDeclarations(periodStart, periodEnd)`

**Interface `PayrollEngine`** — calcul des bulletins de paie et cotisations sociales :
- `calculatePayslip(input: PayslipInput): Payslip`
- `getSocialContributionRates(asOf: Date): SocialContributionRates`
- `getIncomeTaxBrackets(fiscalYear): IncomeTaxBracket[]`
- `calculateSeverancePay(input: SeveranceInput): SeveranceCalculation`
- `getMinimumWage(asOf: Date): number`

**Interface `FinancialStatementsProvider`** — production des états financiers :
- `getBalanceSheet(input): Promise<BalanceSheet>`
- `getIncomeStatement(input): Promise<IncomeStatement>`
- `getTAFIRE(input): Promise<TAFIRE>`
- `getNotes(input): Promise<FinancialNotes>`

### Pattern Registry

Le Registry central (`/lib/jurisdictions/core/registry.ts`) découple les modules pays du reste de l'application. Chaque module pays s'enregistre au démarrage :

```typescript
registerJurisdiction(jurisdiction: Jurisdiction): void
getJurisdiction(code: JurisdictionCode): Jurisdiction
getOhadaJurisdictions(): Jurisdiction[]  // filtre par framework === 'SYSCOHADA'
isJurisdictionRegistered(code): boolean
```

Ce pattern permet d'ajouter un nouveau pays sans modifier le code applicatif existant — il suffit d'ajouter un module dans `/lib/jurisdictions/ohada/countries/` et de l'enregistrer.

---

## 4. Plan Comptable SYSCOHADA

### Les 9 classes

| Classe | Intitulé | Catégorie bilan/résultat | Comptes principaux |
|---|---|---|---|
| **1** | Ressources Durables | Passif / Capitaux propres | Capital (10x), Réserves (11x), Résultat (12x), Subventions (14x), Emprunts (16x) |
| **2** | Actif Immobilisé | Actif | Immo. incorporelles (20x-21x), corporelles (22x-24x), financières (25x-27x), Amort./Dép. (28x-29x) |
| **3** | Stocks | Actif | Marchandises (30x), Matières premières (31x), En-cours (33x-34x), Produits finis (35x) |
| **4** | Comptes de Tiers | Actif/Passif | Fournisseurs (40x), Clients (41x), Personnel (42x), État (44x), Associés (45x) |
| **5** | Trésorerie | Actif | VMP (50x), Banques (52x), Caisse (57x), Virements (58x) |
| **6** | Charges AO | Compte de résultat – Charges | Achats (60x), Transports (61x), Services ext. (62x-63x), Impôts (64x), Personnel (66x), Charges financières (67x) |
| **7** | Produits AO | Compte de résultat – Produits | Ventes (70x), Prestations (706), Production stockée (73x), Subventions (74x), Produits financiers (77x) |
| **8** | HAO | Hors bilan / Exceptionnel | Charges HAO (81x), Produits HAO (82x), Participation (86x), IS (89x) |
| **9** | Comptabilité Analytique | Analytique | Centres de coût (90x-99x), réservés à la comptabilité interne |

### Mapping SYSCOHADA / PCM Mauritius (équivalences principales)

| SYSCOHADA | Intitulé OHADA | PCM Maurice équivalent | Notes |
|---|---|---|---|
| 101 | Capital social | 100 – Share Capital | Structure identique |
| 111-118 | Réserves | 111-118 – Reserves | Libellés similaires |
| 164 | Emprunts bancaires | 151 – Bank loans | Classe différente (1 vs 1) |
| 211 | Frais de développement | 204 – Development costs | Incorporation IFRS 38 |
| 241 | Matériel industriel | 223 – Plant & equipment | Même logique amortissement |
| 411 | Clients | 400 – Trade debtors | Compte de tiers |
| 521 | Banques locales | 512 – Bank accounts | Numérotation proche |
| 601 | Achats marchandises | 600 – Cost of goods sold | Même flux |
| 701 | Ventes marchandises | 700 – Sales | Même flux |
| 831 | Charges HAO | 670 – Extraordinary charges | Pas d'équivalent PCM strict |

---

## 5. États Financiers

### Bilan SYSCOHADA

**Actif (Emplois)**

| Rubrique | Comptes SYSCOHADA | Contenu |
|---|---|---|
| **Actif immobilisé brut** | 20x – 27x | Immo. incorporelles, corporelles, financières |
| Amortissements et dépréciations | 28x – 29x | À déduire pour obtenir la valeur nette |
| **Actif immobilisé net** | Brut – Amort. | Valeur comptable nette |
| **Actif circulant** | 30x – 49x | Stocks, créances, autres actifs courants |
| **Trésorerie actif** | 50x – 57x | VMP + banques + caisse |
| **Écarts de conversion actif** | 478 | Pertes latentes de change |
| **TOTAL ACTIF** | — | Somme des emplois |

**Passif (Ressources)**

| Rubrique | Comptes SYSCOHADA | Contenu |
|---|---|---|
| **Capitaux propres** | 10x – 13x | Capital + primes + réserves + résultat |
| **Subventions et provisions réglementées** | 14x – 15x | Ressources assimilées |
| **Dettes financières** | 16x – 17x | Emprunts bancaires, dettes de crédit-bail |
| **Passif circulant** | 40x – 49x | Dettes fournisseurs, fiscales, sociales |
| **Trésorerie passif** | 52x créditeurs | Découverts bancaires |
| **Écarts de conversion passif** | 479 | Gains latents de change |
| **TOTAL PASSIF** | — | Doit égaler Total Actif |

### Compte de Résultat (cascade de soldes intermédiaires)

```
Ventes de marchandises (701)
- Achats de marchandises (601) ± Variation de stocks (6031)
= MARGE COMMERCIALE (MC)

+ Production vendue (706-707)
+ Production stockée (73x)
+ Production immobilisée (72x)
= CHIFFRE D'AFFAIRES NET (CA)

- Achats consommés hors marchandises (602-608 ± var. stocks)
- Transports (61x)
- Services extérieurs (62x-63x)
= VALEUR AJOUTÉE (VA)

- Impôts et taxes (64x)
- Charges de personnel (66x)
= EXCÉDENT BRUT D'EXPLOITATION (EBE)

± Reprises et dotations d'exploitation (79x - 69x)
± Autres produits/charges d'exploitation (75x - 65x)
= RÉSULTAT D'EXPLOITATION (RE)

± Produits et charges financiers (77x - 67x)
= RÉSULTAT DES ACTIVITÉS ORDINAIRES (RAO)

± Produits et charges HAO (82x - 81x)
- Participation des travailleurs (86x)
- Impôts sur le résultat (89x)
= RÉSULTAT NET (RN)
```

### TAFIRE (Tableau Financier des Ressources et des Emplois)

Le TAFIRE est l'état de trésorerie propre au SYSCOHADA, plus détaillé qu'un tableau de flux IFRS. Il articule trois niveaux :

| Section | Contenu | Solde |
|---|---|---|
| **CAFG** (Capacité d'AutoFinancement Globale) | Résultat net + Dotations amortissements + Dotations provisions – Reprises | Cash généré par l'exploitation |
| **Variation du Fonds de Roulement** | Variation stocks + Variation créances – Variation dettes d'exploitation | Besoin ou dégagement de BFR |
| **Variation de Trésorerie Nette** | CAFG ± FdR ± Investissements ± Financements | Solde de trésorerie final |

Référence normative : SYSCOHADA Révisé 2017 — Tableau n°7.

### 35 Notes Annexes obligatoires

Les 35 notes obligatoires du Système Normal SYSCOHADA couvrent :

| Notes | Thème |
|---|---|
| N°1–2 | Règles et méthodes comptables, dérogations |
| N°3A–3E | Immobilisations (brutes, amortissements, cessions, financières, ECL) |
| N°4–5 | Charges immobilisées, avances sur commandes |
| N°6–8 | Stocks, créances clients, autres créances |
| N°9 | Variation des autres provisions |
| N°10–12 | Capital, primes/réserves, subventions |
| N°13–15 | Emprunts (échéances), provisions financières, retraite |
| N°16–20 | Fournisseurs, dettes fiscales/sociales, autres dettes, trésorerie, écarts de conversion |
| N°21–28 | CA ventilé, achats, variation stocks, transports, services ext., impôts, autres charges, personnel |
| N°29–32 | Frais financiers, produits financiers, charges/produits HAO, impôts sur résultat |
| N°33–35 | Production de l'exercice, dividendes distribués, engagements hors bilan |

### Système Minimal de Trésorerie (SMT)

Réservé aux TPE dont le chiffre d'affaires annuel est inférieur à 60 millions XOF/XAF. Le SMT remplace le bilan et le compte de résultat par deux états simplifiés :

- **État Recettes-Dépenses** : ventes, prestations, autres recettes vs achats, charges de personnel, loyer, eau/électricité, transport, autres charges, impôts
- **Situation de Trésorerie** : solde initial caisse + banque, encaissements, décaissements, solde final

---

## 6. Fiscalité Comparative OHADA

### Zone UEMOA (8 pays — XOF)

| Pays | TVA | IS | IRPP / IUTS tranches (annuel) | Impôt minimum |
|---|---|---|---|---|
| Sénégal | 18 % | 30 % | 0 % → 20 % → 30 % → 35 % → 37 % → 40 % (>13,5M) | 0,5 % CA, min 500k XOF |
| Côte d'Ivoire | 18 % / 9 % réduit | 25 % | 0 % → 16 % → 21 % → 24 % → 28 % → 32 % → 36 % | 0,5 % CA, min 3M XOF |
| Mali | 18 % / 5 % réduit | 30 % | Barème progressif 5 tranches | 1 % CA, min 1,5M XOF |
| Burkina Faso | 18 % | 27,5 % | Barème progressif | 0,5 % CA |
| Niger | 19 % | 30 % | Barème progressif | 1 % CA |
| Bénin | 18 % | 30 % | 0 % → 10 % → 15 % → 19 % → 30 % (>500k/mois) | 1 % CA |
| Togo | 18 % | 27 % | Barème progressif | 1 % CA |
| Guinée-Bissau | 15 % | 25 % | Barème progressif | Variable |

### Zone CEMAC (6 pays — XAF)

| Pays | TVA | IS | IRPP tranches (mensuel) | Impôt minimum |
|---|---|---|---|---|
| Cameroun | 19,25 % (17,5 % + CAC 10 %) | 33 % (30 % + CAC) | 10 % → 15 % → 25 % → 35 % | IMF 2,2 %, min 1M XAF |
| Gabon | 18 % / 10 % réduit | 30 % | Barème progressif | 1 % CA, min 1M XAF |
| Congo (BZV) | 18,9 % | 30 % | Barème progressif | Variable |
| Tchad | 18 % | 35 % | Barème progressif | Variable |
| Centrafrique | 19 % | 30 % | Barème progressif | Variable |
| Guinée Éq. | 15 % | 35 % | Barème progressif | Variable |

### Autres États OHADA

| Pays | Devise | TVA | IS | Note |
|---|---|---|---|---|
| Comores | KMF | 10 % | 35 % | TVA réduite, IS élevé |
| RD Congo | CDF | 16 % | 30 % | Devise flottante, WHT services 14 % |
| Guinée (Conakry) | GNF | 18 % | 25 % | Devise flottante |

---

## 7. Paie OHADA

### Architecture du moteur de paie

La classe abstraite `BaseOhadaPayrollEngine` implémente le calcul générique OHADA en 6 étapes :

1. **Salaire brut total** = fixe + avantages en nature + primes + heures supplémentaires (majorées à 150 %)
2. **Cotisations salariales** = CNSS salarié + caisse de retraite complémentaire (plafonnées)
3. **Revenu net imposable** = (brut − cotisations salariales) × (1 − abattement) − réduction charges de famille
4. **IUTS / IRPP** = calcul progressif par tranches
5. **Cotisations patronales** = CNSS patronal + prestations familiales + accident du travail + formation professionnelle
6. **Salaire net** = brut − cotisations salariales − IUTS/IRPP

### Cotisations sociales comparées (taux principaux)

| Pays | CNSS salarié | CNSS employeur | Retraite complémentaire | PF | AT | FP | SMIG (monnaie locale/mois) |
|---|---|---|---|---|---|---|---|
| Sénégal | 0 % (IPRES uniquement) | 7 % | IPRES : 5,6 % sal. / 8,4 % pat. | 7 % | 1 % | CFCE 3 % | 60 000 XOF |
| Côte d'Ivoire | 6,3 % | 15,7 % | — (inclus CNSS) | 5,75 % | 2 % | FDFP 1,2 % | 75 000 XOF |
| Bénin | 3,6 % | 15,6 % | — | 9 % | 4 % | — | 52 000 XOF |
| Cameroun | CNPS 4,2 % | CNPS 11,5 % | — | 7 % | 1,75 % | FNE 1 % | 41 875 XAF |

### Dénominations locales de l'impôt sur les salaires

| Sigle | Pays | Signification |
|---|---|---|
| IUTS | UEMOA (sauf CI) | Impôt Unique sur les Traitements et Salaires |
| ITS / IRPP | Côte d'Ivoire | Impôt sur les Traitements et Salaires |
| IRPP | Cameroun | Impôt sur le Revenu des Personnes Physiques (+ CAC 10 %) |
| IPTS | Bénin | Impôt sur les Personnes et Traitements de Salaires |
| IGR | Comores | Impôt Général sur le Revenu |
| IRPF | Guinée Équatoriale | Impuesto sobre la Renta de las Personas Físicas |

### Indemnité de licenciement — barème générique OHADA

Conformément à l'article 73 du Code du Travail OHADA :

| Ancienneté | Taux |
|---|---|
| 1 à 5 ans | 30 % du salaire mensuel brut × années |
| 6 à 10 ans | 35 % du salaire mensuel brut × années |
| Plus de 10 ans | 40 % du salaire mensuel brut × années |

Les licenciements économiques sont exonérés d'IUTS/IRPP sur l'indemnité versée. Les moteurs pays peuvent surcharger cette méthode (ex. Sénégal art. L 119, Côte d'Ivoire art. 77 CT).

---

## 8. Migration depuis Maurice

### Procédure pour créer une nouvelle société OHADA

1. **Choisir la juridiction** dans le Registry — `getJurisdiction('SN')` par exemple
2. **Créer la société** dans Supabase avec `jurisdiction_code = 'SN'`, `accounting_framework = 'SYSCOHADA'`, `currency = 'XOF'`
3. **Importer le plan comptable** par défaut via `ohadaChartOfAccounts.getAllAccounts()` — les 200+ comptes SYSCOHADA sont pré-chargés
4. **Paramétrer les taux** : le fichier `tax-config.ts` du pays est chargé automatiquement par le Registry
5. **Configurer la paie** : `payroll-config.ts` du pays fournit les barèmes CNSS et IUTS
6. **Vérifier les soldes d'ouverture** : importer via journal OD (compte 11x pour la reprise des réserves)

### Mapping des comptes existants PCM → SYSCOHADA

| PCM Maurice | SYSCOHADA OHADA | Règle de migration |
|---|---|---|
| 100 Share Capital | 101 Capital social | Mappage direct |
| 111 Retained earnings | 111 Réserves légales | Ventiler si nécessaire |
| 151 Bank loans | 164 Emprunts bancaires | Reclasser en classe 1 |
| 400 Trade debtors | 411 Clients | Mappage direct |
| 440 VAT payable | 443 TVA à décaisser | Comptes spécifiques |
| 512 Bank accounts | 521 Banques locales | Mappage direct |
| 600 Cost of goods | 601 Achats marchandises | Avec variation stocks |
| 700 Sales | 701 Ventes marchandises | Mappage direct |

### Gestion multi-devise (taux fixes EUR-CFA)

Le convertisseur `convertToCurrency()` dans `/lib/jurisdictions/ohada/currencies.ts` gère trois cas :

- **XOF ↔ XAF** : taux fixe (même parité EUR, ratio = 1) — conversion sans perte
- **XOF ou XAF → EUR** : division par 655,957 (taux fixe Banque de France)
- **KMF → EUR** : division par 491,96775 (taux fixe)
- **CDF ou GNF** : taux de marché fourni en paramètre (variable, source externe requise)

---

## 9. Conformité & Certification

### AUDCIF 2017 — Points de conformité

| Exigence AUDCIF | Implémentation Lexora |
|---|---|
| Plan comptable normalisé (9 classes) | `ALL_OHADA_ACCOUNTS` : 200+ comptes prédéfinis |
| Système Normal et Système Minimal | `bilan.ts`, `compte-resultat.ts`, `systeme-minimal-tresorerie.ts` |
| 35 notes annexes obligatoires | `notes-annexes.ts` — catalogue `OHADA_NOTES_NUMERIC` |
| TAFIRE obligatoire (Système Normal) | `tafire.ts` — CAFG, FdR, Trésorerie |
| Codification des journaux | VTE, ACH, BNQ, SAL, OD — champ `journalCode` |
| Lettrage des comptes de tiers | `isReconcilable: true` sur 40x, 41x, 42x |
| Partie double vérifiée | `validateJournalEntry()` — débit = crédit obligatoire |

### Liasse fiscale par pays (déclarations clés)

| Pays | Déclaration TVA | IS annuel | Déclaration salaires | Administration |
|---|---|---|---|---|
| Sénégal | DSF mensuelle (15 du mois suivant) | 3 mois après clôture | IUTS mensuel | DGID |
| Côte d'Ivoire | Déclaration DGI mensuelle | 3 mois après clôture | ITS mensuel | DGI |
| Cameroun | Déclaration DGI (avant 15 du mois) | 3 mois après clôture | IRPP + CNPS mensuel | DGI, MINFI |
| Gabon | Déclaration DGI mensuelle | 3 mois après clôture | IRPP mensuel | DGI |
| RD Congo | Déclaration DGRAD mensuelle | 3 mois après clôture | IBP mensuel | DGRAD |

Le moteur `getRequiredDeclarations(periodStart, periodEnd)` de `BaseOhadaTaxEngine` calcule automatiquement les dates limites :
- **Déclarations mensuelles** → 15 du mois suivant
- **Déclaration annuelle IS** → 3 mois après la fin de la période

---

## 10. Roadmap d'Implémentation

| Sprint | Contenu | Statut |
|---|---|---|
| **S1** | Architecture core + interfaces + Registry + types | Terminé |
| **S2** | Plan comptable SYSCOHADA 9 classes (200+ comptes) | En cours |
| **S3** | Moteurs fiscaux UEMOA (SN, CI, ML, BF, NE, BJ, TG, GW) | Planifié |
| **S4** | Moteurs fiscaux CEMAC (CM, GA, CG, TD, CF, GQ) + autres (KM, CD, GN) | Planifié |
| **S5** | Moteurs paie UEMOA — IUTS + cotisations CNSS | Planifié |
| **S6** | Moteurs paie CEMAC + autres | Planifié |
| **S7** | États financiers : Bilan, Compte de résultat | Planifié |
| **S8** | TAFIRE + 35 Notes annexes + SMT | Planifié |
| **S9** | Tests unitaires et d'intégration complets | Planifié |
| **S10** | Consolidation multi-sociétés + audit trail | Planifié |
| **S11** | Interface utilisateur OHADA (formulaires, états imprimables) | Planifié |
| **S12** | Intégration API REST + documentation OpenAPI | Planifié |

---

## 11. Avantages Concurrentiels vs Sage X3 / Sage 100

| Critère | Lexora | Sage X3 / Sage 100 | Avantage Lexora |
|---|---|---|---|
| **Coût annuel** | 50–200 $/mois selon plan | 5 000–15 000 €/an (licences + maintenance) | 5× à 10× moins cher |
| **Spécialisation OHADA** | Natif SYSCOHADA, 17 pays + MU | Adapté localement par des revendeurs tiers | Couverture native sans sur-mesure coûteux |
| **Mise à jour des barèmes** | Automatique (config JSON versionné + CI/CD) | Manuel via mise à jour éditeur (délais 3–6 mois) | Réactivité lors des révisions fiscales annuelles |
| **IA copilote** | Intégré (Claude) : saisie assistée, détection anomalies, Q&A comptable | Absent ou en option premium | Productivité gain estimé 30–50 % sur la saisie |
| **API REST moderne** | OpenAPI + webhooks + SDK TypeScript | API propriétaire limitée ou absente | Intégration facile e-commerce, payroll, banque |
| **Multi-devise CFA** | Conversion XOF ↔ XAF ↔ EUR nativement (taux fixes + flottants) | Paramétrage manuel par consultant | Aucun surcoût d'implémentation |
| **États financiers SYSCOHADA** | Bilan, CR, TAFIRE, 35 notes générés automatiquement | Paramétrage long par revendeur | Production immédiate conforme AUDCIF 2017 |
| **SMT (TPE)** | Système Minimal de Trésorerie intégré | Non disponible sans développement spécifique | Accessible aux très petites entreprises |
| **Déploiement** | SaaS cloud, prêt en 1 jour | Installation on-premise ou ERP lourd, 3–6 mois | Time-to-value drastiquement réduit |
| **Maintenance** | Supabase + Vercel + Next.js (stack moderne) | Infrastructure lourde dédiée | Scalabilité élastique, coûts réduits |

---

*Document généré le 23 mai 2026. Source : code source Lexora (`/lib/jurisdictions/`), AUDCIF 2017, codes fiscaux nationaux des États membres OHADA.*
