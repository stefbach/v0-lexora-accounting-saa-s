# Taux de change historiques — gouvernance

## 1. Le principe comptable

Un **taux de change appliqué à une transaction est figé au moment de la
transaction**. Une fois enregistré, il est **immutable** — exactement comme
le montant TTC d'une facture ou le numéro d'un chèque émis.

Ce principe découle directement de deux obligations :

1. **Conformité MRA** — les écritures comptables ne doivent pas dériver
   rétroactivement. Un auditeur doit pouvoir rapprocher le montant MUR
   comptabilisé avec le relevé bancaire original.
2. **Intégrité des rapprochements** — un virement reçu en EUR converti par
   la banque à un taux T ne peut pas être comptabilisé à un taux T' différent,
   sinon le compte 411/401 ne se solde jamais.

## 2. Le bug qu'on a corrigé

**Avant** : le système appelait `getTauxChange()` (taux LIVE) chaque fois
qu'il affichait un dashboard ou recalculait un montant MUR. Conséquence :

- Une facture émise en novembre 2025 à 1 000 EUR avait été comptabilisée
  à `1000 × 52.50 = 52 500 MUR` (taux réel du jour).
- Au refresh du dashboard en avril 2026, le système relisait le taux LIVE
  (~54.80) et affichait `1000 × 54.80 = 54 800 MUR`.
- **Dérive de +2 300 MUR** sur une seule facture. Amplifiée sur 300 factures,
  ça fait des dizaines de milliers de MUR d'écart avec les relevés bancaires.

**Après** : chaque écriture historique est convertie via
`getHistoricalRate(supabase, date, devise)` qui lit la table
`taux_change_historique`. Le taux appliqué est celui en vigueur à la date
de la transaction — et il est immuable.

## 3. Alimenter la table `taux_change_historique`

### 3.1 Seed initial (migration 171)

La migration `171_taux_change_historique.sql` insère des estimations au
premier du mois entre juillet 2025 et avril 2026 pour EUR et USD. **Ce sont
des estimations**, pas des taux officiels Bank of Mauritius. Elles existent
uniquement pour que le système ne crashe pas au premier lookup.

**Action recommandée** : un comptable ou l'admin doit les remplacer par les
taux officiels dès que possible.

### 3.2 Back-office (futur)

Un écran admin `app/admin/taux-historiques/page.tsx` sera ajouté pour :

- lister les taux existants (filtre par devise / période),
- ajouter / corriger un taux manuellement (source = `manuel`),
- importer un CSV de taux BoM (source = `api`),
- déclencher un backfill automatique via l'API ExchangeRate-API
  (source = `api`, résolution quotidienne).

### 3.3 Déduction depuis les relevés bancaires

Quand un relevé bancaire montre une conversion EUR → MUR exacte
(ex: « 1 000,00 EUR crédités → 52 487,30 MUR »), l'import doit insérer
une ligne dans `taux_change_historique` avec `source = 'releve_bancaire'`
et `taux_vers_mur = 52.4873`. C'est la source la plus fiable.

### 3.4 Fallback (carry-over)

Si `getHistoricalRate(date, 'EUR')` ne trouve pas de ligne exactement
à cette date, on prend la **plus récente ≤ date**. C'est acceptable à
l'échelle de quelques jours, mais pas sur plusieurs mois — d'où l'importance
d'alimenter la table au moins mensuellement.

## 4. Quel helper utiliser ?

| Cas d'usage                                          | Helper                                  | Fichier                               |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Nouvelle écriture, date = aujourd'hui                | `getTauxChange()`                       | `lib/taux-change.ts`                  |
| Affichage d'un dashboard avec écritures historiques  | `getHistoricalRate(supabase, d, dev)`   | `lib/accounting/historical-rates.ts`  |
| Import relevé bancaire (N lignes, dates variées)     | `getHistoricalRatesForDates(supa, t[])` | `lib/accounting/historical-rates.ts`  |
| Recalcul d'écritures anciennes (batch / migration)   | `getHistoricalRatesForDates(...)`       | `lib/accounting/historical-rates.ts`  |
| Conversion montant live dans un form (saisie temps-réel) | `getTauxChange()` + `convertToMUR()` | `lib/taux-change.ts`                  |

**Règle mnémotechnique** : si tu convertis en MUR avec une date dans le
passé → `getHistoricalRate`. Si tu convertis avec la date du jour →
`getTauxChange`. En cas de doute, c'est `getHistoricalRate`.

## 5. Que faire si `MissingHistoricalRateError` ?

Ce throw signifie : « la table `taux_change_historique` ne contient aucun
taux pour cette devise à une date ≤ la date demandée ».

### 5.1 Pour l'opérateur / utilisateur final

L'UI doit afficher un message du type :

> Impossible de convertir cette transaction en MUR : aucun taux de change
> historique n'est disponible pour <devise> à la date du <date>.
> Contacte ton administrateur pour seed la table des taux.

### 5.2 Pour l'admin

1. Vérifier le relevé bancaire de la période : y a-t-il une conversion
   exacte utilisable comme source ?
2. Consulter le site Bank of Mauritius (section « Indicative Exchange Rates »)
   pour récupérer le taux de référence du jour proche.
3. Insérer une ligne :
   ```sql
   INSERT INTO taux_change_historique (date_taux, devise, taux_vers_mur, source)
   VALUES ('2025-11-15', 'EUR', 53.42, 'manuel')
   ON CONFLICT (date_taux, devise) DO UPDATE
     SET taux_vers_mur = EXCLUDED.taux_vers_mur,
         source = EXCLUDED.source;
   ```
4. Relancer l'action côté UI.

### 5.3 Pour le dev

- Ne **jamais** rattraper un `MissingHistoricalRateError` en silence avec un
  fallback 1:1 ou un fallback hardcodé. Ça reproduit exactement le bug
  d'origine.
- Le throw doit remonter à l'UI, ou à défaut être logué avec suffisamment
  de contexte pour qu'un opérateur puisse seed la table.

## 6. Cache in-memory

`getHistoricalRate` et `getHistoricalRatesForDates` mettent en cache les
résultats au niveau du process Node (Map en RAM). C'est sûr parce que les
taux historiques sont **immutables par design** : si quelqu'un UPDATE une
ligne (cas rare — correction d'une erreur de saisie), il faut redémarrer le
process ou appeler `_clearHistoricalRateCache()` (test-only).

En pratique, sur Next.js (serverless / edge), chaque invocation a son propre
cache et la durée de vie est suffisamment courte pour que ce soit non-problématique.

## 7. Checklist pour tout nouveau code

Avant de merger un feature qui manipule des montants multi-devises :

- [ ] Est-ce que je convertis une transaction historique ? → `getHistoricalRate`.
- [ ] Est-ce que je stocke le taux appliqué sur la ligne d'écriture (colonne
      `taux_change` de la table `ecritures`) ? → oui, pour audit.
- [ ] Est-ce que le montant MUR est recalculé à chaque affichage ? → non,
      il doit être **persisté** et relu tel quel.
- [ ] Ai-je une gestion propre de `MissingHistoricalRateError` dans l'UI ?
- [ ] Mes tests couvrent-ils un cas avec devise ≠ MUR et date passée ?

## 8. Références croisées

- `supabase/migrations/171_taux_change_historique.sql` — création de la table.
- `lib/accounting/historical-rates.ts` — helpers de lecture.
- `lib/taux-change.ts` — helpers LIVE (ne pas utiliser pour du passé).
- `lib/accounting/ecritures-factures.ts` — générateur d'écritures (doit
  idéalement appeler `getHistoricalRate` quand `date_facture` est passée).
