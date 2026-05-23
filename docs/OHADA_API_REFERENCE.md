# Lexora OHADA — API Reference

> Version: 1.0 · Date: 2026-05-23 · Audience: développeurs intégrant Lexora

---

## Table des matières

1. [Authentification](#authentification)
2. [Rate Limits](#rate-limits)
3. [Endpoints — Juridictions](#juridictions)
4. [Endpoints — Plan comptable](#plan-comptable)
5. [Endpoints — États financiers](#états-financiers)
6. [Endpoints — Paie](#paie)
7. [Modèles TypeScript](#modèles-typescript)
8. [Codes d'erreur](#codes-derreur)
9. [Webhooks](#webhooks)
10. [SDKs](#sdks)
11. [Liens utiles](#liens-utiles)

---

## Authentification

Toutes les routes nécessitent un token Bearer dans le header `Authorization` :

```http
Authorization: Bearer <token>
```

Les tokens sont générés depuis `/admin/settings/api-keys`. Chaque token est lié à une `societeId` et à un rôle (`READ_ONLY`, `ACCOUNTANT`, `ADMIN`). Les tokens expirent après 90 jours ou sur révocation explicite.

---

## Rate Limits

| Type d'endpoint | Limite          |
|-----------------|-----------------|
| GET             | 1 000 req/heure |
| POST            | 100 req/heure   |

Les headers de réponse `X-RateLimit-Remaining` et `X-RateLimit-Reset` indiquent les quotas restants. Un dépassement retourne HTTP `429 Too Many Requests`.

---

## Juridictions

### `GET /api/jurisdictions`

Liste les 18 juridictions supportées : Maurice (cadre PCM) et les 17 États membres OHADA (cadre SYSCOHADA).

**Response 200**

```json
{
  "jurisdictions": [
    {
      "code": "SN",
      "name": "Senegal",
      "nameFr": "Sénégal",
      "framework": "SYSCOHADA",
      "currency": "XOF",
      "active": true
    },
    {
      "code": "MU",
      "name": "Mauritius",
      "nameFr": "Maurice",
      "framework": "PCM",
      "currency": "MUR",
      "active": true
    }
  ],
  "count": 18
}
```

---

### `GET /api/jurisdictions/[code]`

Détails complets d'une juridiction : configuration fiscale et paramètres de paie.

**Paths exemples** : `/api/jurisdictions/SN`, `/api/jurisdictions/CI`, `/api/jurisdictions/MU`

**Response 200**

```json
{
  "code": "SN",
  "nameFr": "Sénégal",
  "framework": "SYSCOHADA",
  "currency": "XOF",
  "tax": {
    "vatRates": [
      { "code": "NORMAL", "rate": 0.18, "label": "TVA normale" },
      { "code": "EXEMPT", "rate": 0.00, "label": "Exonéré" }
    ],
    "corporateIncomeTaxRate": 0.30,
    "withholdingTaxRates": {
      "dividends": 0.10,
      "services": 0.05,
      "rent": 0.15
    }
  },
  "payroll": {
    "cnss": {
      "employeeRate": 0.056,
      "employerRate": 0.142,
      "ceiling": 432000
    },
    "incomeTaxBrackets": [
      { "from": 0,      "to": 630000,  "rate": 0.00 },
      { "from": 630001, "to": 1500000, "rate": 0.20 },
      { "from": 1500001,"to": null,    "rate": 0.40 }
    ]
  }
}
```

**Erreurs**

| HTTP | Code                   | Description                         |
|------|------------------------|-------------------------------------|
| 404  | `UNKNOWN_JURISDICTION` | Code juridiction non reconnu        |

---

## Plan comptable

### `GET /api/jurisdictions/chart-of-accounts`

Retourne le plan comptable complet pour le framework demandé.

**Query params**

| Paramètre   | Requis | Valeurs              | Défaut      |
|-------------|--------|----------------------|-------------|
| `framework` | non    | `SYSCOHADA` \| `PCM` | `SYSCOHADA` |

**Exemple** : `/api/jurisdictions/chart-of-accounts?framework=SYSCOHADA`

**Response 200**

```json
{
  "framework": "SYSCOHADA",
  "classes": [
    { "number": 1, "labelFr": "Ressources Durables" },
    { "number": 2, "labelFr": "Actif Immobilisé" },
    { "number": 3, "labelFr": "Actif Circulant (stocks)" },
    { "number": 4, "labelFr": "Actif Circulant (créances)" },
    { "number": 5, "labelFr": "Trésorerie" },
    { "number": 6, "labelFr": "Charges" },
    { "number": 7, "labelFr": "Produits" },
    { "number": 8, "labelFr": "Comptes Spéciaux" }
  ],
  "accounts": [
    {
      "number": "411",
      "labelFr": "Clients",
      "classNumber": 4,
      "category": "BALANCE_SHEET_ASSET",
      "normalBalance": "DEBIT",
      "isReconcilable": true
    }
  ],
  "count": 200
}
```

---

## États financiers

### `POST /api/ohada/statements`

Génère les états financiers SYSCOHADA (ou PCM) pour une société et une période données. Supporte les données comparatives N-1.

**Body**

```json
{
  "societeId": "550e8400-e29b-41d4-a716-446655440000",
  "jurisdictionCode": "SN",
  "periodStart": "2024-01-01",
  "periodEnd": "2024-12-31",
  "comparativePeriodStart": "2023-01-01",
  "comparativePeriodEnd": "2023-12-31",
  "statementType": "all"
}
```

**Valeurs `statementType`**

| Valeur           | Description                                              |
|------------------|----------------------------------------------------------|
| `bilan`          | Bilan (actif / passif)                                   |
| `compte-resultat`| Compte de résultat                                       |
| `tafire`         | Tableau de financement par ressources et emplois (TAFIRE)|
| `notes`          | Annexes comptables (35 notes SYSCOHADA)                  |
| `all`            | Tous les états ci-dessus                                 |

**Response 200**

```json
{
  "jurisdictionCode": "SN",
  "period": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "bilan": {
    "assets": {
      "immobilisations": 45000000,
      "stocks": 12000000,
      "creances": 8500000,
      "tresorerie": 3200000,
      "total": 68700000
    },
    "liabilities": {
      "capitauxPropres": 30000000,
      "dettesFinancieres": 20000000,
      "dettesCirculantes": 18700000,
      "total": 68700000
    },
    "balanced": true
  },
  "compteResultat": {
    "lines": [
      { "code": "TA", "labelFr": "Chiffre d'affaires", "amount": 95000000 },
      { "code": "RN", "labelFr": "Résultat net",        "amount": 12500000 }
    ],
    "netIncome": 12500000
  },
  "tafire": {
    "capacityForSelfFinancing": 18000000,
    "workingCapitalChange": -2500000,
    "netCashFromOperations": 15500000
  },
  "notes": {
    "noteCount": 35,
    "notes": [
      { "number": 1, "title": "Méthodes comptables", "content": "..." }
    ]
  }
}
```

**Erreurs**

| HTTP | Code                    | Description                     |
|------|-------------------------|---------------------------------|
| 422  | `R1_UNBALANCED`         | Données source non équilibrées  |
| 403  | `PERIOD_CLOSED`         | Période fiscale clôturée        |
| 403  | `INSUFFICIENT_PERMISSIONS` | Droits insuffisants          |

---

## Paie

### `POST /api/ohada/payroll/calculate`

Calcule un bulletin de paie complet selon les règles de cotisations sociales et le barème IRPP de la juridiction.

**Body**

```json
{
  "jurisdictionCode": "SN",
  "employeeId": "660e8400-e29b-41d4-a716-446655440001",
  "period": { "year": 2024, "month": 6 },
  "grossSalary": 500000,
  "benefits": 50000,
  "bonuses": 0,
  "familyDependents": 2,
  "isExpat": false
}
```

| Champ              | Type    | Description                                        |
|--------------------|---------|----------------------------------------------------|
| `jurisdictionCode` | string  | Code ISO-2 de la juridiction                       |
| `grossSalary`      | number  | Salaire brut de base (devise locale)               |
| `benefits`         | number  | Avantages en nature et indemnités imposables       |
| `bonuses`          | number  | Primes exceptionnelles                             |
| `familyDependents` | integer | Nombre de personnes à charge (déductions IRPP)     |
| `isExpat`          | boolean | Régime expatrié (taux et plafonds spécifiques)     |

**Response 200**

```json
{
  "jurisdictionCode": "SN",
  "period": { "year": 2024, "month": 6 },
  "payslip": {
    "grossSalary": 550000,
    "taxableGross": 525808,
    "employeeContributions": [
      {
        "code": "IPRES",
        "label": "IPRES (employé)",
        "base": 432000,
        "rate": 0.056,
        "amount": 24192
      }
    ],
    "employerContributions": [
      {
        "code": "IPRES_PATRON",
        "label": "IPRES (employeur)",
        "base": 432000,
        "rate": 0.086,
        "amount": 37152
      }
    ],
    "incomeTax": 75000,
    "netSalary": 450808,
    "totalEmployerCost": 615000
  }
}
```

---

## Modèles TypeScript

Les types suivants sont exportés depuis `@lexora/ohada-sdk` et correspondent aux structures retournées par l'API.

### `Account`

```typescript
interface Account {
  number: string
  label: string
  labelFr: string
  classNumber: number
  category:
    | 'BALANCE_SHEET_ASSET'
    | 'BALANCE_SHEET_LIABILITY'
    | 'INCOME_STATEMENT_CHARGE'
    | 'INCOME_STATEMENT_PRODUCT'
  isAuxiliary: boolean
  normalBalance: 'DEBIT' | 'CREDIT'
  isReconcilable: boolean
  jurisdiction: 'OHADA' | 'MU' | 'SN' | 'CI' | string
}
```

### `JournalEntry`

```typescript
interface JournalEntry {
  id: string
  date: Date
  reference: string
  description: string
  journalCode: 'VTE' | 'ACH' | 'BNQ' | 'SAL' | 'OD'
  jurisdictionCode: string
  societeId: string
  lines: JournalLine[]
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'POSTED' | 'REVERSED'
  createdAt: Date
  updatedAt: Date
}

interface JournalLine {
  accountNumber: string
  label: string
  debit: number
  credit: number
  auxiliaryCode?: string
}
```

### `TaxEngine`

```typescript
interface TaxEngine {
  jurisdiction: string
  calculateVat(
    amount: number,
    vatCode: string
  ): VatCalculation
  calculateCorporateIncomeTax(
    taxableIncome: number,
    fiscalYear: number
  ): TaxCalculation
  calculateWithholdingTax(
    amount: number,
    beneficiaryType: 'INDIVIDUAL' | 'COMPANY' | 'NON_RESIDENT'
  ): TaxCalculation
}
```

### `PayrollEngine`

```typescript
interface PayrollEngine {
  jurisdiction: string
  calculatePayslip(input: PayslipInput): Payslip
  getSocialContributionRates(asOf: Date): SocialContributionRates
  getIncomeTaxBrackets(fiscalYear: number): IncomeTaxBracket[]
  calculateSeverancePay(input: SeveranceInput): SeveranceCalculation
}
```

---

## Codes d'erreur

| Code                      | HTTP | Description                              |
|---------------------------|------|------------------------------------------|
| `R1_UNBALANCED`           | 422  | Écriture non équilibrée (débit ≠ crédit) |
| `INVALID_ACCOUNT`         | 422  | Numéro de compte invalide pour le framework actif |
| `UNKNOWN_JURISDICTION`    | 404  | Code juridiction non reconnu             |
| `INSUFFICIENT_PERMISSIONS`| 403  | Droits insuffisants pour cette opération |
| `PERIOD_CLOSED`           | 403  | Période fiscale clôturée, écritures refusées |
| `SOCIETE_NOT_FOUND`       | 404  | Identifiant `societeId` introuvable      |
| `EMPLOYEE_NOT_FOUND`      | 404  | Identifiant `employeeId` introuvable     |
| `RATE_LIMIT_EXCEEDED`     | 429  | Quota de requêtes dépassé                |

---

## Webhooks

Configurer les webhooks depuis `/admin/webhooks`. Chaque événement est envoyé en `POST` vers l'URL configurée avec le header `X-Lexora-Signature` (HMAC-SHA256).

**Événements disponibles**

| Événement               | Déclencheur                                     |
|-------------------------|-------------------------------------------------|
| `journal-entry.created` | Nouvelle écriture comptable créée (DRAFT)       |
| `journal-entry.posted`  | Écriture validée et postée au grand livre       |
| `payslip.generated`     | Bulletin de paie calculé et disponible          |
| `statement.generated`   | États financiers générés                        |

**Payload exemple**

```json
{
  "event": "payslip.generated",
  "timestamp": "2024-06-30T10:15:00Z",
  "societeId": "550e8400-e29b-41d4-a716-446655440000",
  "data": { "employeeId": "...", "period": { "year": 2024, "month": 6 } }
}
```

---

## SDKs

### TypeScript / JavaScript

```bash
npm install @lexora/ohada-sdk
```

```typescript
import { LexoraOhada } from '@lexora/ohada-sdk'

const client = new LexoraOhada({ apiKey: 'lx_live_xxxx' })

// Calculer un bulletin de paie
const payslip = await client.payroll.calculate({
  jurisdictionCode: 'SN',
  employeeId: 'uuid',
  period: { year: 2024, month: 6 },
  grossSalary: 500000,
  benefits: 50000,
  bonuses: 0,
  familyDependents: 2,
  isExpat: false
})

// Générer les états financiers
const statements = await client.statements.generate({
  societeId: 'uuid',
  jurisdictionCode: 'SN',
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  statementType: 'all'
})
```

### Python *(Q4 2026)*

```bash
pip install lexora-ohada
```

```python
from lexora_ohada import LexoraOhada

client = LexoraOhada(api_key="lx_live_xxxx")
payslip = client.payroll.calculate(jurisdiction_code="SN", ...)
```

---

## Liens utiles

- Architecture OHADA : `/docs/OHADA_ARCHITECTURE.md`
- Guide utilisateur : `/docs/OHADA_USER_GUIDE.md`
- Code source (lib) : `/lib/jurisdictions/ohada/`
- Taux historiques : `/docs/RATES_HISTORICAL.md`
- Schéma JSON transactions : `/docs/TX_JSON_SCHEMA.md`
