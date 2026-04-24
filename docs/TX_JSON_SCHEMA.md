# Schéma `releves_bancaires.transactions_json`

Ce document fixe la convention de sérialisation de chaque transaction stockée
dans la colonne JSONB `releves_bancaires.transactions_json` (un tableau
d'objets transactions issu de l'OCR du relevé bancaire).

Pendant longtemps, le rapprochement bancaire recalculait les montants MUR au
taux du jour. Résultat : un relevé EUR traité 3 jours plus tard donnait un
montant MUR différent à chaque recalcul → écarts 512xxx vs 411/401. On fige
désormais le taux au moment de l'OCR (ou du paiement), exactement comme
`factures.taux_change` (cf. migration 034) et
`ecritures_comptables_v2.taux_change_applique` (cf. migration 207).

## Schéma canonique (TypeScript)

```ts
interface TransactionJSON {
  /** Date de valeur au format ISO (YYYY-MM-DD). */
  date: string
  /** Libellé brut lu sur le relevé. */
  libelle: string

  /** Montant débité — exprimé dans la devise d'origine du relevé. */
  debit?: number
  /** Montant crédité — exprimé dans la devise d'origine du relevé. */
  credit?: number

  // ── Champs devises (NOUVEAUX) ────────────────────────────────────────
  /**
   * OPTIONNEL. Devise spécifique de cette transaction (ex. 'EUR', 'USD').
   * Par défaut, on hérite de la devise du compte bancaire
   * (comptes_bancaires.devise). À remplir si la tx est dans une devise
   * différente du compte (rare, mais arrive sur les comptes multi-devises).
   */
  devise?: string

  /**
   * OPTIONNEL. Montant de la tx dans la devise d'origine AVANT conversion
   * MUR. Si absent, on considère que `debit`/`credit` sont déjà en devise
   * d'origine. Utile quand l'OCR a pré-converti en MUR et qu'on veut
   * garder la trace du montant source.
   */
  montant_origine?: number

  /**
   * OPTIONNEL mais FORTEMENT RECOMMANDÉ pour les comptes en devise non-MUR.
   * Taux de change ORIGINE → MUR figé au moment de l'OCR (ou du paiement
   * saisi manuellement). Immutable une fois écrit. Si absent au moment du
   * rapprochement, on fallback sur le taux historique à la date de la tx
   * (table `taux_change`), PUIS on fige ce taux dérivé dans
   * `ecritures_comptables_v2.taux_change_applique`.
   */
  taux_change_applique?: number

  // ── Autres champs existants conservés ────────────────────────────────
  /** Numéro de pièce / référence bancaire. */
  reference?: string
  /** Statut de rapprochement (non_rapproche | rapproche | suggere). */
  statut?: string
  /** ID de la facture rapprochée (si statut = rapproche). */
  facture_id?: string | null
  /** Code de lettrage (aaa, aab, …). */
  lettre?: string | null
  [autre: string]: unknown
}
```

## Règle de propagation (rapprochement → écriture)

Quand le rapprochement bancaire crée une écriture BNQ à partir d'une
transaction (via `createEcrituresForPayment` dans
`lib/accounting/ecritures-factures.ts`), il **DOIT** :

1. Lire `tx.taux_change_applique` sur la transaction. Si absent, lire le taux
   historique dans `taux_change` à la date de `tx.date` et figer cette valeur
   sur la tx (update du JSON) pour les rapprochements suivants.
2. Lire `tx.devise` (fallback : `comptes_bancaires.devise` du relevé).
3. Lire `tx.montant_origine` (fallback : `tx.debit ?? tx.credit`).
4. Passer ces 3 valeurs en paramètre de `createEcrituresForPayment` :
   - `devise_origine`
   - `montant_origine`
   - `taux_change_applique`
5. Ces 3 champs sont écrits sur **les 2 lignes BNQ** (tier + banque) de
   l'écriture créée, dans les colonnes du même nom sur
   `ecritures_comptables_v2` (cf. migration 207).

## Règle d'or

> Le taux stocké (ou à défaut le taux historique à la date de la tx) doit être
> **figé** sur l'écriture_v2 via `taux_change_applique`. On ne relit jamais
> `taux_change` du jour au reporting, sinon les totaux MUR dérivent.

## Exemples

### Transaction MUR native (cas par défaut)

```json
{
  "date": "2026-04-20",
  "libelle": "VIR FT2026-0123",
  "credit": 15000,
  "reference": "VIR-0123"
}
```

→ Écriture BNQ créée avec `devise_origine = NULL`,
`taux_change_applique = NULL`, `montant_origine = NULL`.

### Transaction EUR avec taux figé

```json
{
  "date": "2026-04-20",
  "libelle": "WIRE TRANSFER EUR",
  "debit": 1000,
  "devise": "EUR",
  "montant_origine": 1000,
  "taux_change_applique": 46.8500
}
```

→ Écriture BNQ : `debit_mur = 46850.00`, `devise_origine = 'EUR'`,
`montant_origine = 1000`, `taux_change_applique = 46.8500`.
Recalcul futur : on relit ces 3 colonnes, on ne touche plus jamais à
`taux_change` du jour.
