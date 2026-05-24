# WAVE 2-D — Corrections MRA / fiscal (risque régulatoire)

**Branche** : `claude/kind-mccarthy-zknYB`
**Date** : 2026-05-24
**Auteur** : sous-agent W2-D
**Risque régulatoire global** : **ÉLEVÉ** — amendes MRA et ROC en cas de
soumission inexacte ou non-déclaration. Trois des cinq problèmes
(soumission factice, APS faux, CSR faux) ont un impact réglementaire
direct ; les deux autres (date_limite, ROC directors) sont des risques
de non-conformité formelle.

Nombre de problèmes traités : **5/5**.

Fichiers concernés (tous absolus) :

- `/home/user/v0-lexora-accounting-saa-s/app/client/mra-cit/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/client/mra-tds/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/client/mra-sft/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/client/mra-roc/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/client/it-form3/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/mra/cit/route.ts`
- `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/mra/roc/route.ts`
- `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/mra/sft/route.ts`
- `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/mra/tds/route.ts`
- `/home/user/v0-lexora-accounting-saa-s/lib/mra-ifp.ts` (IFP — invoices only)
- `/home/user/v0-lexora-accounting-saa-s/lib/telegram/mra-robot.ts`
  (robot Playwright pour soumissions MRA — CIT/TDS/VAT/PAYE/CSG/PRGF)
- `/home/user/v0-lexora-accounting-saa-s/supabase/migrations/260_mra_complete_10_10.sql`

---

## Problème 1 — Soumission MRA non branchée (CIT, TDS, SFT, ROC)

### État actuel

Dans `app/api/comptable/mra/cit/route.ts` (ligne 126) et
`app/api/comptable/mra/roc/route.ts` (ligne 50), l'action `submit_mra`
flippe simplement `statut = 'submitted'` en base et écrit
`date_filing/date_declaration`. Aucun appel HTTP, aucune référence MRA
externe (`ack_ref`), aucun screenshot d'accusé. L'utilisateur télécharge
XML/PDF et upload manuellement sur eservices.mra.mu.

`lib/mra-ifp.ts` (Invoice Fiscalisation Platform) ne couvre **que les
factures** — l'API IFP MRA est exclusivement dédiée à la fiscalisation
de factures (EBS — Electronic Billing System). Elle **ne peut PAS**
servir à soumettre CIT/TDS/SFT/ROC : ce ne sont pas le même endpoint,
ni le même protocole, ni le même flux d'authentification.

Cependant, le repo dispose déjà d'un module pour le « vrai » dépôt MRA
des déclarations : `lib/telegram/mra-robot.ts`. C'est un robot
**Playwright headless** qui :

- se connecte sur `eservices.mra.mu` / `eservices3.mra.mu` /
  `eservices38.mra.mu` avec les credentials de la société (chiffrées
  dans `societe_mra_credentials`, mig 267),
- navigue vers VAT / CIT / PAYE / CSG / TDS / PRGF,
- remplit le formulaire à partir des CSV/XML générés côté Lexora,
- capture un screenshot + accusé.

C'est la **seule** voie technique réaliste — le MRA ne publie pas
d'API REST publique pour les déclarations (autre que IFP factures).

### Recommandation : **Option A modifiée** — câbler `submit_mra`
sur `submitMraDeclaration()` du robot Playwright, avec **fallback
explicite `manual_needed`** si le robot retourne ce statut.

Justification :

- Option B (« marquer comme soumis manuellement » + champ référence) est
  **insuffisante** : on a déjà tout le code Playwright écrit, l'enlever
  serait un retour en arrière régulatoire.
- Le fallback `manual_needed` du robot couvre déjà le cas CAPTCHA/OTP/UI
  cassée : on a tous les fichiers en pièces jointes Telegram → soumission
  manuelle, puis l'utilisateur saisit la `ack_ref` reçue.
- Pour SFT/ROC : pas de path Playwright défini (le robot ne gère
  aujourd'hui que `paye|csg|vat|tds|prgf`). Il faut **étendre** le robot
  ou faire **Option B uniquement pour SFT/ROC** (pas d'eservices SFT
  séparé — SFT se déclare via le portail générique MRA, ROC se dépose
  via le Companies and Business Registration Department, pas le MRA).

### Plan de patch

**1. Étendre le type `MraSubmitInput`** dans `lib/telegram/mra-robot.ts`
pour ajouter `cit` (URL déjà définie ligne 64-68). Le robot prend déjà
`type: 'paye' | 'csg' | 'vat' | 'tds' | 'prgf'` — ajouter `'cit'` à
l'union :

```diff
- type: 'paye' | 'csg' | 'vat' | 'tds' | 'prgf'
+ type: 'paye' | 'csg' | 'vat' | 'tds' | 'prgf' | 'cit'
```

**2. Refactoriser `app/api/comptable/mra/cit/route.ts`** pour brancher
`submit_mra` au robot :

```diff
   if (action === 'submit_mra') {
-    updateFields.statut = 'submitted'
-    updateFields.submitted_at = new Date().toISOString()
-    updateFields.date_declaration = new Date().toISOString().slice(0, 10)
+    // Génère XML CIT à partir du record cit_returns
+    const { data: citRow } = await supabase
+      .from('cit_returns').select('*').eq('societe_id', societe_id).eq('exercice', exercice).single()
+    const xml = generateCitXml(citRow)
+    const { submitMraDeclaration } = await import('@/lib/telegram/mra-robot')
+    const result = await submitMraDeclaration({
+      societe_id, type: 'cit', periode: exercice,
+      files: [{ filename: `cit_${exercice}.xml`, content: xml }],
+    })
+    if (result.status === 'success') {
+      updateFields.statut = 'submitted'
+      updateFields.submitted_at = new Date().toISOString()
+      updateFields.date_declaration = new Date().toISOString().slice(0, 10)
+      updateFields.mra_ack_ref = result.ack_ref
+      updateFields.mra_screenshot_b64 = result.screenshot_b64
+    } else if (result.status === 'manual_needed') {
+      updateFields.statut = 'manual_needed'
+      updateFields.mra_last_error = result.message
+      // Les fichiers sont déjà envoyés en PJ Telegram par le robot
+    } else {
+      return NextResponse.json({ error: result.message, status: 'failed' }, { status: 502 })
+    }
   }
```

**3. Ajouter colonnes** `mra_ack_ref TEXT`, `mra_screenshot_b64 TEXT`,
`mra_last_error TEXT` et étendre le CHECK `statut` pour inclure
`'manual_needed'` :

```sql
ALTER TABLE cit_returns
  ADD COLUMN IF NOT EXISTS mra_ack_ref TEXT,
  ADD COLUMN IF NOT EXISTS mra_screenshot_b64 TEXT,
  ADD COLUMN IF NOT EXISTS mra_last_error TEXT;
ALTER TABLE cit_returns DROP CONSTRAINT IF EXISTS cit_returns_statut_check;
ALTER TABLE cit_returns ADD CONSTRAINT cit_returns_statut_check
  CHECK (statut IN ('draft','review','approved','submitted','manual_needed','accepted','rejected'));
-- Idem pour roc_annual_returns, tds_declarations.
```

**4. Pour SFT et ROC** : pas de route Playwright dédiée — appliquer
**Option B** (« Marquer comme soumis manuellement » + champ référence
MRA + upload accusé PDF) :

```diff
- {roc?.statut === 'approved' && <Button onClick={() => doAction('submit_mra')}>Soumettre MRA</Button>}
+ {roc?.statut === 'approved' && <MarkAsSubmittedDialog
+    onSubmit={async (ref, ackFile) => {
+       await doActionWithFiles('mark_submitted', { mra_ack_ref: ref, ack_pdf: ackFile })
+    }} />}
```

Côté API ROC :

```diff
   if (action === 'submit_mra') {
-    updateFields.statut = 'submitted'
-    updateFields.date_filing = new Date().toISOString().slice(0, 10)
+    return NextResponse.json({ error: 'Utilisez mark_submitted (manuel)' }, { status: 400 })
   }
+  if (action === 'mark_submitted') {
+    updateFields.statut = 'submitted'
+    updateFields.date_filing = new Date().toISOString().slice(0, 10)
+    updateFields.mra_ack_ref = body.mra_ack_ref
+    // accusé PDF uploadé dans bucket `mra_acknowledgements/<societe_id>/<exercice>.pdf`
+  }
```

### Effort & risque

- Effort : **2-3 j-h** (CIT) + **0.5 j** (SFT/ROC Option B) + **1 j**
  pour étendre le robot Playwright avec les sélecteurs CIT
  (sélecteurs CSS à valider sur eservices38.mra.mu, dépend des credentials
  sandbox).
- Risque : moyen. Le robot Playwright est déjà fonctionnel pour
  PAYE/CSG/VAT. Étendre à CIT = principalement remplir les sélecteurs.
  Fallback `manual_needed` garantit qu'aucune déclaration ne « disparaît ».
- **Risque régulatoire si non corrigé** : ÉLEVÉ. Les utilisateurs
  pensent avoir soumis (statut « submitted » affiché en vert) alors
  qu'aucune transmission MRA n'a eu lieu. Pénalités MRA pour
  non-déclaration = Rs 2 000/mois + 5 % d'intérêts (ITA s. 122).

---

## Problème 2 — IT Form 3 : 2 erreurs métier (APS et CSR)

Fichier : `/home/user/v0-lexora-accounting-saa-s/app/client/it-form3/page.tsx`

### Erreur 2.a — Critère APS faux (ligne 272)

**Référence loi** : Income Tax Act 1995, **Section 111A(1)(a)**
(« Advance Payment System »).

> A company shall pay tax under the Advance Payment System where its
> **gross income** in the preceding income year exceeded Rs 10 million
> **OR** its **tax liability** in the preceding income year exceeded
> Rs 50,000.

Le critère est donc bien **OR** entre gross income N-1 ET tax N-1.
**MAIS** le code utilise `revenuAffaires` **de l'année courante** au
lieu de l'année N-1 — c'est ça l'erreur.

> `revenuAffaires` (state IT Form 3) = chiffre d'affaires **de
> l'exercice en cours de déclaration**, pas de l'exercice précédent.
> ITA s.111A est explicite : « **in the preceding income year** ».

Le bon critère doit comparer le revenu **N-1** :

```diff
- const isAps = revenuAffaires > 10_000_000 || (priorYearData?.impotCalcule || 0) > 50_000
+ // ITA s.111A(1)(a) : gross income N-1 > 10M MUR OR tax N-1 > 50k MUR
+ const grossIncomeNMoins1 = priorYearData?.totalRevenus || priorYearData?.revenuAffaires || 0
+ const impotNMoins1 = priorYearData?.impotCalcule || 0
+ const isAps = grossIncomeNMoins1 > 10_000_000 || impotNMoins1 > 50_000
```

Note importante : pour la **première année d'activité**, ITA s.111A(2)
exempte d'APS. Ajouter :

```diff
+ const isAps = !firstYear && (
+   grossIncomeNMoins1 > 10_000_000 || impotNMoins1 > 50_000
+ )
```

(`firstYear` existe déjà en state ligne 97.)

### Erreur 2.b — CSR mal plafonné (ligne 274)

**Référence loi** : Income Tax Act 1995 **Section 50L** (Corporate Social
Responsibility) + Finance Act 2009.

> Every company shall set up a CSR Fund equivalent to **2 % of its
> chargeable income** of the preceding year. The CSR Fund applies to
> **all resident companies** except specific exempt categories listed
> in the Income Tax Regulations (GBC1 historiques, sociétés de
> production de films, sociétés exonérées d'IS).

Donc :

- Pas de seuil de Rs 10 M. CSR s'applique à **toutes** les sociétés
  résidentes sur **chargeable income** (= revenu imposable), pas sur
  revenu imposable filtré.
- Les **exemptions** sont **catégorielles** (régime, secteur), pas
  basées sur un seuil de revenu.

```diff
- const csr = revImp > 10_000_000 ? revImp * 0.02 : 0
+ // CSR = 2% du chargeable income (ITA s.50L). Applicable à toutes
+ // sociétés résidentes, SAUF catégories exemptées (régime GBC1
+ // historique, sociétés exemptes IS, sociétés de production audio-
+ // visuelle, etc.). L'exemption n'est PAS basée sur un seuil de revenu.
+ const csrExempt = csrExemptRegimes.includes(societe?.regime || '') ||
+                    societe?.csr_exempt === true
+ const csr = csrExempt ? 0 : Math.max(0, revImp) * 0.02
```

avec en haut du fichier :

```typescript
// Catégories exonérées CSR (Income Tax Regulations, Schedule)
const csrExemptRegimes = ['gbc1', 'authorised_company', 'freeport']
```

À noter : depuis 2017, le CSR Fund a été modifié — 75 % du fonds doit
être versé au MRA pour redistribution, 25 % peut être géré directement
par la société. Le calcul reste 2 % du chargeable income.

### Effort & risque

- Effort : **30 min** (4 lignes de code + tests manuel).
- **Risque régulatoire si non corrigé** : ÉLEVÉ.
  - APS faux ⇒ sociétés exemptées d'APS marquées comme assujetties (ou
    inversement) ⇒ pénalité de retard sur trimestriels (Rs 2 000/trim
    + 5 % intérêts).
  - CSR faux ⇒ sociétés < 10 M de revenu imposable ne paient PAS le CSR
    alors qu'elles devraient ⇒ rappel + pénalités lors de l'audit MRA.

---

## Problème 3 — CIT : `date_limite` hardcodé `endYear-12-30`

Fichier : `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/mra/cit/route.ts`
ligne 91-93.

### État actuel

```typescript
// Date limite : 6 mois après clôture exercice (Maurice juin → décembre)
const [, endYear] = exercice.split('-')
const dateLimit = `${endYear}-12-30`
```

Le commentaire **suppose** que toutes les sociétés ferment au 30 juin
(exercice fiscal traditionnel Maurice). C'est **faux** : depuis Finance
Act 2018, beaucoup de sociétés (notamment GBC) ferment au 31 décembre,
et certaines ont des clôtures non-standard (31 mars, 30 septembre).

### Référence loi

**ITA Section 116(1)** : « A company shall furnish a return … **not
later than 6 months from the end of the month in which its accounting
period ends.** »

Exemples :

- Clôture 30 juin 2025 → return due **31 décembre 2025** (6 mois après
  fin du mois de clôture, soit 30/06 + 6 mois = 31/12).
- Clôture 31 décembre 2025 → return due **30 juin 2026**.
- Clôture 31 mars 2025 → return due **30 septembre 2025**.

### Patch

```diff
- // Date limite : 6 mois après clôture exercice (Maurice juin → décembre)
- const [, endYear] = exercice.split('-')
- const dateLimit = `${endYear}-12-30`
+ // Date limite CIT : ITA s.116(1) — 6 mois après la fin du mois de
+ // clôture de l'exercice. La société renseigne sa fin d'exercice dans
+ // societes.date_fin_exercice (mig 006).
+ const { data: socFiscal } = await supabase
+   .from('societes')
+   .select('date_fin_exercice')
+   .eq('id', societe_id)
+   .single()
+ const dateLimit = computeCitDeadline(exercice, socFiscal?.date_fin_exercice)
```

Avec, dans `lib/accounting/mra-deadlines.ts` (nouveau fichier) :

```typescript
/**
 * Calcule la date limite CIT selon ITA s.116(1) :
 * 6 mois après la fin du mois de clôture de l'exercice.
 *
 * @param exercice    Ex : "2024-2025"
 * @param dateFinExercice  Date ISO de clôture stockée sur societes
 *                         (ex "2025-06-30"). Si null, fallback au
 *                         30/06 de la fin d'exercice.
 */
export function computeCitDeadline(
  exercice: string,
  dateFinExercice: string | null | undefined
): string {
  const [, endYear] = exercice.split('-')
  // Fallback : 30 juin de endYear (exercice juillet-juin classique)
  const closing = dateFinExercice
    ? new Date(dateFinExercice)
    : new Date(`${endYear}-06-30`)

  // Dernier jour du mois de clôture
  const endOfClosingMonth = new Date(
    closing.getFullYear(),
    closing.getMonth() + 1,
    0
  )
  // + 6 mois → dernier jour du mois +6
  const deadline = new Date(
    endOfClosingMonth.getFullYear(),
    endOfClosingMonth.getMonth() + 7,
    0
  )
  return deadline.toISOString().slice(0, 10)
}
```

**Tests à valider** :

- `computeCitDeadline('2024-2025', '2025-06-30')` → `'2025-12-31'`
- `computeCitDeadline('2024-2025', '2025-12-31')` → `'2026-06-30'`
- `computeCitDeadline('2024-2025', '2025-03-31')` → `'2025-09-30'`
- `computeCitDeadline('2024-2025', null)` → `'2025-12-31'` (fallback
  juin-juin).

### Effort & risque

- Effort : **45 min**.
- Risque réglementaire si non corrigé : **MOYEN**. Pour les sociétés
  non-juin/juin, la date affichée est fausse → utilisateur peut
  manquer la deadline réelle (pénalités).

---

## Problème 4 — SFT : faux positifs massifs (seuil seulement, pas de
typologie qualifiée)

Fichier : `/home/user/v0-lexora-accounting-saa-s/app/client/mra-sft/page.tsx`
+ RPC `sft_detect_transactions` (mig 260 ligne 127).

### État actuel

La RPC remonte **toute** transaction ≥ 50 000 MUR :

- factures clients/fournisseurs (toutes catégories confondues),
- mouvements bancaires classe 5 (donc paiements salaires, paie MRA,
  loyers, achats fournisseur — TOUT).

Conséquence : pour une PME qui fait Rs 50k de chiffre d'affaires
mensuel, la RPC remonte des centaines de lignes — utilisateur incapable
de discerner ce qui doit réellement être déclaré au MRA en SFT.

### Référence loi

**Income Tax (SFT) Regulations 2015** + **MRA Communiqué 2019/06**.
Le SFT vise spécifiquement les transactions à risque BEPS/blanchiment :

| Catégorie SFT | Seuil | Détection Lexora |
|---|---|---|
| **A. Immobilier** : achat/vente de biens immobiliers | ≥ 2 M MUR | compte 211x / 213x — débit ou crédit |
| **B. Espèces** : retraits/dépôts cash > seuil | ≥ 500 k MUR cumul/an | écritures Caisse (530x) avec contrepartie tiers physique |
| **C. Virements internationaux** entrants/sortants | ≥ 500 k MUR | écritures classe 5 avec compte tiers étranger (`tiers.country != 'MU'`) |
| **D. Dividendes** versés à non-résidents | ≥ 500 k MUR | comptes 457x avec tiers non-résident |
| **E. Intérêts** versés à non-résidents | ≥ 100 k MUR | comptes 661x avec tiers non-résident |
| **F. Loyers** payés à non-résidents | ≥ 240 k MUR (Rs 20k/mois) | compte 6132 avec tiers non-résident |
| **G. Transactions related party** > seuil | ≥ 500 k MUR | écritures avec `tiers.is_related_party = true` |
| **H. Vente d'actifs > seuil** | ≥ 2 M MUR | classe 7752 / 7755 |

(Les seuils peuvent varier — les chiffres ci-dessus sont indicatifs
pour le calibrage initial. À valider avec le service MRA Compliance.)

### Patch RPC (mig 271 nouvelle)

```sql
CREATE OR REPLACE FUNCTION public.sft_detect_transactions(
  p_societe_id UUID,
  p_year INT,
  p_threshold_mur NUMERIC DEFAULT 50000  -- garde pour rétrocompat, override par catégorie
) RETURNS TABLE (
  source           TEXT,
  date_trans       DATE,
  counterparty     TEXT,
  amount_mur       NUMERIC,
  transaction_type TEXT,
  sft_category     TEXT,  -- NEW : 'immobilier', 'cash', 'virement_intl', 'dividende_nr', 'interet_nr', 'loyer_nr', 'related_party', 'vente_actif'
  threshold_used   NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- A. IMMOBILIER : compte 211x / 213x ≥ 2M MUR
  SELECT 'ecriture'::TEXT, e.date_ecriture, COALESCE(t.nom, 'tiers'),
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         'immobilier'::TEXT,
         'immobilier'::TEXT, 2000000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND (e.numero_compte LIKE '211%' OR e.numero_compte LIKE '213%')
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 2000000
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year

  UNION ALL
  -- B. CASH : caisse 530x cumul > 500k/an avec un même tiers
  SELECT 'ecriture_cash'::TEXT, MAX(e.date_ecriture), t.nom,
         SUM(GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)))::NUMERIC,
         'cash'::TEXT,
         'cash'::TEXT, 500000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '530%'
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
  GROUP BY t.id, t.nom
  HAVING SUM(GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))) >= 500000

  UNION ALL
  -- C. VIREMENTS INTL : tiers non-résident ≥ 500k MUR
  SELECT 'ecriture_intl'::TEXT, e.date_ecriture, t.nom,
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         'virement_international'::TEXT,
         'virement_intl'::TEXT, 500000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '5%'
    AND t.pays IS NOT NULL AND t.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 500000
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year

  UNION ALL
  -- D. DIVIDENDES VERSÉS NON-RÉSIDENTS : compte 457 avec tiers non-MU
  SELECT 'ecriture_dividende'::TEXT, e.date_ecriture, t.nom,
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         'dividende_non_resident'::TEXT,
         'dividende_nr'::TEXT, 500000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '457%'
    AND t.pays IS NOT NULL AND t.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 500000
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year

  UNION ALL
  -- E. INTÉRÊTS VERSÉS NON-RÉSIDENTS : compte 661x avec tiers non-MU
  SELECT 'ecriture_interet'::TEXT, e.date_ecriture, t.nom,
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         'interet_non_resident'::TEXT,
         'interet_nr'::TEXT, 100000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '661%'
    AND t.pays IS NOT NULL AND t.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 100000
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year

  UNION ALL
  -- F. LOYERS VERSÉS NON-RÉSIDENTS : compte 6132 avec tiers non-MU ≥ 240k
  SELECT 'ecriture_loyer'::TEXT, e.date_ecriture, t.nom,
         GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC,
         'loyer_non_resident'::TEXT,
         'loyer_nr'::TEXT, 240000::NUMERIC
  FROM public.ecritures_comptables_v2 e
  JOIN public.tiers t ON t.id = e.tiers_id
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte LIKE '6132%'
    AND t.pays IS NOT NULL AND t.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 240000
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year

  ORDER BY 2 DESC;
END;
$$;
```

Et côté UI (`app/client/mra-sft/page.tsx`) :

```diff
- <input type="number" value={threshold} onChange={...} />
+ {/* Le seuil n'est plus paramétrable par l'UI : chaque catégorie a
+     son propre seuil légal défini dans la RPC. On garde threshold
+     comme override d'urgence (admin) mais on retire le champ par défaut. */}
+ <select value={categoryFilter} onChange={...}>
+   <option value="all">Toutes catégories</option>
+   <option value="immobilier">Immobilier (≥ 2M)</option>
+   <option value="cash">Espèces (≥ 500k cumul)</option>
+   <option value="virement_intl">Virements internationaux (≥ 500k)</option>
+   <option value="dividende_nr">Dividendes non-résidents (≥ 500k)</option>
+   <option value="interet_nr">Intérêts non-résidents (≥ 100k)</option>
+   <option value="loyer_nr">Loyers non-résidents (≥ 240k)</option>
+ </select>
```

Et nouvelle colonne `sft_category` dans le tableau (déjà retournée par
la RPC v2).

### Effort & risque

- Effort : **2 j-h** (RPC SQL + UI + tests sur jeu de données réel).
- Risque réglementaire si non corrigé : **MOYEN**. Les utilisateurs
  qui regardent SFT y voient trop de bruit, ignorent, et **manquent
  les vraies transactions à déclarer**. Pénalité MRA SFT non-déclaration
  = Rs 5 000/transaction omise (ITA s.123A).

---

## Problème 5 — ROC : directors et shareholders non saisis dans l'UI

Fichier : `/home/user/v0-lexora-accounting-saa-s/app/client/mra-roc/page.tsx`
+ schéma `roc_annual_returns` (mig 260 ligne 170-174).

### État actuel

La table a `directors JSONB` et `shareholders JSONB` (mig 260 lignes
170, 173) avec format documenté :

```
directors:    [{ name, nic, nationality, date_appointed, resigned, address }]
shareholders: [{ name, brn_or_nic, shares, pct }]
```

Mais l'UI (page.tsx) ne propose **aucun formulaire** pour les saisir.
Le state `form` (ligne 25-29) n'initialise que les champs scalaires.
Résultat : `directors=[]` et `shareholders=[]` à chaque save → ROC
déposé sans la liste obligatoire des administrateurs et actionnaires.

### Référence loi

**Companies Act 2001, Section 223** : « Every company shall lodge an
annual return … containing **the names and addresses of directors and
secretaries** … and **a list of members** … » + **Section 224** :
forme du formulaire.

C'est une **obligation absolue** : un annual return sans directors/
shareholders est rejeté par le Companies and Business Registration
Department (CBRD) — pénalité Rs 600/mois de retard (CA 2001 s.226).

### Patch UI

Ajouter deux sections dans `app/client/mra-roc/page.tsx` après la Card
« Company info », avant les boutons d'action :

```diff
+ {/* Section Directors */}
+ <Card>
+   <CardHeader className="flex flex-row items-center justify-between">
+     <CardTitle className="text-base">{t('mra.roc.directors_title', locale)} ({(form.directors || []).length})</CardTitle>
+     <Button size="sm" variant="outline" onClick={() => setForm({
+        ...form,
+        directors: [...(form.directors || []), {
+          name: '', nic: '', nationality: 'MU',
+          date_appointed: '', resigned: false, address: ''
+        }]
+     })}>+ Ajouter</Button>
+   </CardHeader>
+   <CardContent>
+     {(form.directors || []).length === 0 && (
+       <p className="text-sm text-slate-500 italic">Aucun administrateur saisi — Companies Act s.223 requiert au moins un directeur.</p>
+     )}
+     {(form.directors || []).map((d: any, i: number) => (
+       <div key={i} className="grid grid-cols-6 gap-2 mb-2 p-2 border rounded">
+         <input placeholder="Nom complet" value={d.name} onChange={e => updateDirector(i, 'name', e.target.value)} className="col-span-2 border rounded px-2 py-1 text-sm" />
+         <input placeholder="NIC/Passeport" value={d.nic} onChange={e => updateDirector(i, 'nic', e.target.value)} className="border rounded px-2 py-1 text-sm" />
+         <input placeholder="Nationalité (ISO2)" value={d.nationality} onChange={e => updateDirector(i, 'nationality', e.target.value)} className="border rounded px-2 py-1 text-sm" />
+         <input type="date" placeholder="Nommé le" value={d.date_appointed} onChange={e => updateDirector(i, 'date_appointed', e.target.value)} className="border rounded px-2 py-1 text-sm" />
+         <div className="flex items-center gap-1">
+           <input type="checkbox" checked={d.resigned} onChange={e => updateDirector(i, 'resigned', e.target.checked)} />
+           <span className="text-xs">Démissionnaire</span>
+           <Button size="sm" variant="ghost" onClick={() => removeDirector(i)}>×</Button>
+         </div>
+         <input placeholder="Adresse" value={d.address} onChange={e => updateDirector(i, 'address', e.target.value)} className="col-span-6 border rounded px-2 py-1 text-sm" />
+       </div>
+     ))}
+   </CardContent>
+ </Card>
+
+ {/* Section Shareholders */}
+ <Card>
+   <CardHeader className="flex flex-row items-center justify-between">
+     <CardTitle className="text-base">{t('mra.roc.shareholders_title', locale)} ({(form.shareholders || []).length})</CardTitle>
+     <Button size="sm" variant="outline" onClick={() => setForm({
+        ...form,
+        shareholders: [...(form.shareholders || []), {
+          name: '', brn_or_nic: '', shares: 0, pct: 0
+        }]
+     })}>+ Ajouter</Button>
+   </CardHeader>
+   <CardContent>
+     {(form.shareholders || []).length === 0 && (
+       <p className="text-sm text-slate-500 italic">Aucun actionnaire saisi — Companies Act s.223 requiert la liste des membres.</p>
+     )}
+     {(form.shareholders || []).map((s: any, i: number) => (
+       <div key={i} className="grid grid-cols-5 gap-2 mb-2 p-2 border rounded">
+         <input placeholder="Nom" value={s.name} onChange={e => updateShareholder(i, 'name', e.target.value)} className="col-span-2 border rounded px-2 py-1 text-sm" />
+         <input placeholder="BRN/NIC" value={s.brn_or_nic} onChange={e => updateShareholder(i, 'brn_or_nic', e.target.value)} className="border rounded px-2 py-1 text-sm" />
+         <input type="number" placeholder="Parts" value={s.shares} onChange={e => updateShareholder(i, 'shares', parseInt(e.target.value) || 0)} className="border rounded px-2 py-1 text-sm" />
+         <div className="flex items-center gap-1">
+           <input type="number" step="0.01" placeholder="%" value={s.pct} onChange={e => updateShareholder(i, 'pct', parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-sm" />
+           <Button size="sm" variant="ghost" onClick={() => removeShareholder(i)}>×</Button>
+         </div>
+       </div>
+     ))}
+     {(form.shareholders || []).reduce((sum: number, s: any) => sum + (Number(s.pct) || 0), 0) !== 100 && (form.shareholders || []).length > 0 && (
+       <p className="text-xs text-red-600 mt-2">⚠️ Total % actions ≠ 100 — vérifier la répartition.</p>
+     )}
+   </CardContent>
+ </Card>
```

Helpers à ajouter en haut du composant :

```typescript
const updateDirector = (i: number, key: string, value: any) => {
  setForm((f: any) => {
    const arr = [...(f.directors || [])]
    arr[i] = { ...arr[i], [key]: value }
    return { ...f, directors: arr }
  })
}
const removeDirector = (i: number) =>
  setForm((f: any) => ({ ...f, directors: (f.directors || []).filter((_: any, j: number) => j !== i) }))
const updateShareholder = (i: number, key: string, value: any) => {
  setForm((f: any) => {
    const arr = [...(f.shareholders || [])]
    arr[i] = { ...arr[i], [key]: value }
    return { ...f, shareholders: arr }
  })
}
const removeShareholder = (i: number) =>
  setForm((f: any) => ({ ...f, shareholders: (f.shareholders || []).filter((_: any, j: number) => j !== i) }))
```

Et **bloquer le passage `submit_review` → `approved` → `submitted`** si
`directors.length === 0 || shareholders.length === 0` (validation côté
API `app/api/comptable/mra/roc/route.ts`) :

```diff
   if (action === 'submit_review') {
+    const { data: rocRow } = await supabase.from('roc_annual_returns')
+      .select('directors, shareholders').eq('societe_id', societe_id).eq('exercice', exercice).single()
+    if (!rocRow?.directors || rocRow.directors.length === 0) {
+      return NextResponse.json({ error: 'Au moins un directeur requis (Companies Act s.223)' }, { status: 400 })
+    }
+    if (!rocRow?.shareholders || rocRow.shareholders.length === 0) {
+      return NextResponse.json({ error: 'Liste des actionnaires requise (Companies Act s.223)' }, { status: 400 })
+    }
+    const totalPct = rocRow.shareholders.reduce((s: number, sh: any) => s + (Number(sh.pct) || 0), 0)
+    if (Math.abs(totalPct - 100) > 0.5) {
+      return NextResponse.json({ error: `Répartition actionnariat = ${totalPct}% (doit faire 100%)` }, { status: 400 })
+    }
     updateFields.statut = 'review'
     updateFields.reviewer_id = user.id
   }
```

### Effort & risque

- Effort : **1 j-h** (UI form + validation API + i18n labels).
- Risque réglementaire si non corrigé : **MOYEN-ÉLEVÉ**. Annual returns
  ROC déposés sans directors/shareholders sont **rejetés par le CBRD**
  ⇒ pénalité Rs 600/mois jusqu'à rectification (CA 2001 s.226), avec
  possible radiation de la société du registre si >2 ans (s.309).

---

## Synthèse exécutive

| # | Problème | Effort | Risque régulatoire |
|---|---|---|---|
| 1 | Soumission MRA non branchée | 3-4 j-h | **ÉLEVÉ** |
| 2a | APS critère faux (revenu courant au lieu de N-1) | 15 min | **ÉLEVÉ** |
| 2b | CSR plafond Rs 10M illégal | 15 min | **ÉLEVÉ** |
| 3 | CIT date_limite hardcodé | 45 min | MOYEN |
| 4 | SFT faux positifs (pas de typologie) | 2 j-h | MOYEN |
| 5 | ROC directors/shareholders absents UI | 1 j-h | MOYEN-ÉLEVÉ |
| **Total** | | **≈ 7 j-h** | |

### Ordre de priorité recommandé

1. **#2a + #2b** (corrections de quelques lignes, gains immédiats, risque
   ÉLEVÉ — à patcher dans la session courante).
2. **#3** (45 min, isolé, pas de migration BDD).
3. **#5** (ROC directors/shareholders — gros impact UX et conformité,
   1 jour).
4. **#1** (refacto soumission MRA → Playwright — chantier 3-4 j, à
   planifier sur une PR dédiée avec tests sandbox).
5. **#4** (refonte RPC SFT — 2 j, peut attendre la prochaine itération
   après alignement avec un service MRA Compliance pour les seuils
   exacts).

### Références légales citées

- **ITA 1995 s.111A** — Advance Payment System
- **ITA 1995 s.116(1)** — Délai de dépôt CIT
- **ITA 1995 s.50L** — CSR Fund (2 % chargeable income)
- **ITA 1995 s.122** — Pénalités pour non-déclaration
- **ITA 1995 s.123A** — SFT non-déclaration
- **Companies Act 2001 s.223** — Contenu de l'annual return
- **Companies Act 2001 s.226** — Pénalités annual return en retard
- **Companies Act 2001 s.309** — Radiation pour défaut de dépôt
- **Income Tax (SFT) Regulations 2015** — Typologies SFT
- **MRA Communiqué 2019/06** — Seuils SFT par catégorie

---

**Fin du rapport W2-D.**
