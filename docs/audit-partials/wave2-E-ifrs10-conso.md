# WAVE 2-E — IFRS 10 / IAS 21 — Consolidation cassée

**Auteur** : sous-agent W2-E
**Branche** : `claude/kind-mccarthy-zknYB`
**Date** : 2026-05-24
**Skill réf.** : `lexora-gbc-ifrs-complete` (Phase F : IFRS 10 — Phase A : IAS 21)
**Fichiers analysés** :
- `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/gbc/consolidate/route.ts`
- `/home/user/v0-lexora-accounting-saa-s/app/client/gbc-consolidation/page.tsx`
- `/home/user/v0-lexora-accounting-saa-s/app/client/tiers-consolidation/page.tsx` (hors‑sujet : dédoublonnage tiers domestique, **pas** une page de saisie d'éliminations IFRS 10)
- `/home/user/v0-lexora-accounting-saa-s/supabase/migrations/254_gbc_consolidation_ifrs10.sql`
- `/home/user/v0-lexora-accounting-saa-s/supabase/migrations/249_ias21_monnaie_fonctionnelle.sql`

---

## 1. Diagnostic du bug

### 1.1 Symptôme

`app/api/comptable/gbc/consolidate/route.ts` (lignes 25-30) charge bien la table
`consolidation_eliminations` depuis Supabase et l'expose au front via le champ
`eliminations`, **mais la boucle d'application est strictement vide** :

```ts
// Apply eliminations
const elimMap = new Map<string, number>()
for (const elim of eliminations || []) {
  // Each elimination is a debit/credit pair on certain accounts — for now we keep it simple
  // and just expose them so the consumer can apply.
}
```

La variable `elimMap` est instanciée mais jamais lue. Le payload `aggregate`
retourné au client est **exactement la somme arithmétique brute** des balances
des sociétés du périmètre (cf. RPC `consolidate_aggregate` mig 254 ligne 88‑106 :
agrégation simple sans déduction des intercos).

Aucun consommateur n'applique non plus les éliminations côté front : la page
`/client/gbc-consolidation` n'affiche que des KPI agrégés (scope, goodwill
total, **compteur** d'éliminations, NCI) — elle ne soustrait jamais le montant
des éliminations du bilan/P&L consolidé. Il n'existe par ailleurs aucune page
de saisie d'éliminations (la page `tiers-consolidation` est sans rapport :
elle fait du dédoublonnage de noms de tiers domestiques) — l'unique chemin
d'ajout est l'action POST `add_elimination` du même endpoint, qui n'est
appelée nulle part dans le code (`grep "add_elimination" → 1 hit, dans la
route elle-même`).

### 1.2 Conséquences quantifiées (exemple chiffré)

**Cas de test** : holding mauricienne **Holdco Ltd** (devise fonct. **USD**)
détenant à 100 % **Subco Ltd** (devise fonct. **MUR**).

Au cours de l'exercice :
- Subco vend Rs 1 000 000 de prestations à Holdco (vente interco).
- Holdco refacture Rs 200 000 de management fees à Subco.
- Holdco a prêté 5 000 000 USD à Subco (compte courant intra-groupe).

**Soldes attendus après élimination IFRS 10 §B86** :

| Poste | Brut agrégé (aujourd'hui) | Consolidé correct (IFRS 10) | Écart |
|---|---:|---:|---:|
| Produits (compte 7) | 1 200 000 MUR | 0 MUR | **+1 200 000 MUR (surévalué)** |
| Charges (compte 6) | 1 200 000 MUR | 0 MUR | **+1 200 000 MUR (surévalué)** |
| Créances intra-groupe (411x) | ~200 000 MUR | 0 MUR | **+200 000 MUR (actif fictif)** |
| Dettes intra-groupe (401x) | ~200 000 MUR | 0 MUR | **+200 000 MUR (passif fictif)** |
| Prêt intra-groupe (créance 451/dette 451) | ~225 MUR M | 0 MUR | **+225 MUR M (actif + passif fictifs)** |
| Capitaux propres consolidés | inchangés (par chance le résultat est neutre) | idem | 0 |

Et **avant** même les éliminations, le simple fait de sommer `debit_mur` /
`credit_mur` de deux sociétés en devises fonctionnelles différentes **sans
appliquer la translation IAS 21** produit un bilan consolidé non
homogène : Subco est convertie de MUR vers MUR (OK) mais Holdco est convertie
de USD vers MUR au taux historique de chaque écriture (cf. mig 249, colonne
`taux_fonct_vers_mur` posée sur chaque écriture) — alors qu'**IFRS 10 §B86 +
IAS 21 §39** exigent au consolidé :
- actifs/passifs au **closing rate** de la date de clôture du groupe,
- produits/charges au **taux moyen** de la période,
- écart vs taux historique → **OCI compte 1078 (CTA)**.

Aujourd'hui, l'écart de translation **n'est jamais calculé** au niveau
consolidé. La RPC `ias21_compute_cta` (mig 249) existe mais elle calcule le
CTA d'**une seule** société, pas du groupe consolidé. Elle n'est référencée
nulle part dans `consolidate/route.ts`.

### 1.3 Pourquoi c'est silencieux

1. L'API retourne 200 OK avec un payload complet (`aggregate`, `eliminations`,
   `nci`, `total_goodwill_mur`). Aucun warning, aucun status d'avertissement.
2. La page front affiche `data?.eliminations?.length || 0` comme KPI →
   l'utilisateur voit "0 éliminations" et croit que c'est normal (la table
   est vide en pratique : pas de page de saisie).
3. Le commentaire `for now we keep it simple` n'est ni un `TODO` ni un
   `console.warn`. Un grep `TODO|FIXME|XXX` sur le fichier ne remonte rien.
4. La balance consolidée tombe **mathématiquement juste** (débit = crédit)
   parce que l'agrégation est une somme symétrique. L'utilisateur n'a aucun
   signal que les intercos sont en double.
5. Les audits FSC / Big Four ne porteront sur ces états que **lors du
   commissariat aux comptes annuel** (6 mois après clôture). Entre temps,
   le client peut prendre des décisions stratégiques (distribution de
   dividendes, ratios bancaires, covenants) sur des chiffres faux.

**Risque régulatoire** : faux états financiers consolidés publiés à la
FSC → potentiel retrait de licence GBC (MUR 1 M d'amende + suspension),
révision rétroactive du PER 80 %, requalification des intercos en
distribution déguisée par la MRA.

---

## 2. Patch proposé

### 2.1 Schéma `consolidation_eliminations` (existant, mig 254)

Colonnes utiles :

| Colonne | Type | Usage IFRS 10 |
|---|---|---|
| `parent_societe_id` | UUID | société tête de groupe (clé de scope) |
| `exercice` | TEXT (`YYYY-YYYY`) | période fiscale |
| `elimination_type` | enum 8 valeurs | détermine les comptes ciblés |
| `from_societe_id` / `to_societe_id` | UUID | les 2 sociétés concernées par l'interco |
| `amount_mur` | NUMERIC(15,2) | montant à éliminer (MUR) |
| `source_ecriture_ids` | UUID[] | audit trail (références aux écritures originales) |

Les 8 `elimination_type` :

| Type | Comptes ciblés (PCM Maurice) | Sens IFRS |
|---|---|---|
| `intra_revenue` | 7xx (produits) | IFRS 10 §B86(c) — chiffre d'affaires intra-groupe |
| `intra_cogs` | 6xx (charges) | IFRS 10 §B86(c) — charges intra-groupe (contrepartie) |
| `intra_loan` | 16xx / 26xx / 45xx | IFRS 10 §B86(c) — prêts intra-groupe |
| `intra_dividend` | 7611 / 1061 | IFRS 10 §B86(b) — dividendes distribués entre entités du groupe |
| `intra_ar_ap` | 411x / 401x | IFRS 10 §B86(c) — comptes clients/fournisseurs intra-groupe |
| `goodwill_amortization` | 6811 / 28071 | IFRS 3 — n'est plus amorti mais testé en impairment (IAS 36) |
| `unrealized_profit_stock` | 31xx / 7xx | IFRS 10 §B86(c) — profit interne dans le stock |
| `fair_value_adjustment` | 2xxx + 1078 | IFRS 3 §18 — ajustement de juste valeur à l'acquisition |

### 2.2 Algorithme d'élimination (IFRS 10 §B86)

**Principe** : on construit une map `accountKey → { debit, credit }` initialisée
par l'agrégat brut (`aggregate`), puis on applique les éliminations en
décrémentant les soldes appropriés. La nature de la décrémentation dépend du
type d'élimination.

Convention de signe (PCM Maurice) :
- comptes de classe 6 (charges) : sens normal débit → élimination = **crédit** (réduit le débit)
- comptes de classe 7 (produits) : sens normal crédit → élimination = **débit** (réduit le crédit)
- comptes de classe 4 actif (411x) : sens débit → élimination = **crédit**
- comptes de classe 4 passif (401x) : sens crédit → élimination = **débit**
- prêts (16xx passif / 26xx actif) : élimination symétrique

**Mapping `elimination_type` → comptes affectés** :

| Type | Compte hi-level (préfixe) côté débit | Compte hi-level côté crédit |
|---|---|---|
| `intra_revenue` | `7` (réduit le produit) | `6` (réduit la charge en miroir, si non géré par `intra_cogs`) |
| `intra_cogs` | `7` (autres produits) | `6` (charge correspondante) |
| `intra_loan` | `16` ou `45` (passif prêt) | `26` ou `45` (actif créance) |
| `intra_dividend` | `7611` (produits financiers reçus) | `1061` ou `12` (résultat distribué) |
| `intra_ar_ap` | `401` (dette fournisseur) | `411` (créance client) |
| `unrealized_profit_stock` | `7` (résultat interne) | `31` (stock surévalué) |
| `goodwill_amortization` | `28071` | `6811` (impact P&L à neutraliser sous IFRS 3) |
| `fair_value_adjustment` | dynamique | dynamique (laissé en mode "écriture libre" — out of scope V1) |

### 2.3 Translation IAS 21

Pour chaque société du périmètre dont `devise_fonctionnelle ≠ devise_fonctionnelle_groupe` :

| Type de poste (RPC `ias21_classify_account`) | Taux à appliquer | Compte de contrepartie de l'écart |
|---|---|---|
| `monetary` (5x, 4xx, 16x, 17x) | **closing rate** (taux à la date de clôture) | 1078 (CTA, OCI) |
| `non_monetary` (2x, 3x) | **historical rate** (déjà figé dans `taux_fonct_vers_mur` au moment de l'écriture) | aucun (pas re-translaté) |
| `pnl` (6x, 7x) | **average rate** de la période | 1078 (CTA) |
| `equity` (10x à 15x, sauf 1078) | **historical rate** à l'acquisition / à l'augmentation de capital | aucun |
| `equity_cta` (1078) | non re-translaté (c'est le résultat) | — |

**Formule du CTA consolidé** :
```
CTA_consolidé = Σ(actifs au closing rate) - Σ(passifs au closing rate)
              - Σ(capitaux propres au taux historique)
              - Σ(résultat au taux moyen)
```

Ce CTA est inscrit en **réserve de translation** (1078) au passif du bilan
consolidé et passe en **OCI** (autres éléments du résultat global) — pas en
P&L (IAS 21 §39(c)).

### 2.4 Code patch

Patch sur `app/api/comptable/gbc/consolidate/route.ts`. Le patch :
- conserve l'API publique (mêmes champs retournés),
- ajoute un nouveau champ `aggregate_consolidated` (post-élimination + translation),
- ajoute un champ `translation_adjustment` (montant CTA),
- ne casse pas les consommateurs existants (additif).

```diff
 import { NextResponse } from 'next/server'
 import { createClient as createServerClient } from '@/lib/supabase/server'
 import { getAdminClient } from '@/lib/supabase/admin'

 export const dynamic = 'force-dynamic'

+// ─── Mapping IFRS 10 §B86 : elimination_type → (compte_debit_prefix, compte_credit_prefix) ───
+// Indique quels comptes sont impactés (préfixes) lors de l'élimination.
+// Le moteur ne décide pas de compte précis : il décrémente le solde des
+// comptes du préfixe au prorata, en partant des plus actifs.
+const ELIM_RULES: Record<string, { debit: string[]; credit: string[] }> = {
+  intra_revenue:           { debit: ['7'],            credit: ['6'] },
+  intra_cogs:              { debit: ['7'],            credit: ['6'] },
+  intra_loan:              { debit: ['16','45'],      credit: ['26','45'] },
+  intra_dividend:          { debit: ['7611','761'],   credit: ['106','12'] },
+  intra_ar_ap:             { debit: ['401','40'],     credit: ['411','41'] },
+  unrealized_profit_stock: { debit: ['7'],            credit: ['31','3'] },
+  goodwill_amortization:   { debit: ['28071'],        credit: ['6811'] },
+  fair_value_adjustment:   { debit: [],               credit: [] },  // V2
+}
+
+type Row = { numero_compte: string; total_debit_mur: number; total_credit_mur: number; contributing_societes: string[] }
+
+function applyEliminations(rows: Row[], eliminations: any[]): Row[] {
+  // Index par compte pour O(1)
+  const map = new Map<string, Row>()
+  for (const r of rows) map.set(r.numero_compte, { ...r,
+    total_debit_mur: Number(r.total_debit_mur) || 0,
+    total_credit_mur: Number(r.total_credit_mur) || 0,
+  })
+
+  const adjust = (prefixes: string[], side: 'debit' | 'credit', amount: number) => {
+    if (amount <= 0 || prefixes.length === 0) return 0
+    // Sélection des comptes éligibles, triés par solde décroissant côté concerné
+    const candidates = [...map.values()]
+      .filter(r => prefixes.some(p => r.numero_compte.startsWith(p)))
+      .sort((a, b) => (side === 'debit'
+        ? b.total_debit_mur - a.total_debit_mur
+        : b.total_credit_mur - a.total_credit_mur))
+    let remaining = amount
+    for (const r of candidates) {
+      const available = side === 'debit' ? r.total_debit_mur : r.total_credit_mur
+      const take = Math.min(remaining, available)
+      if (side === 'debit') r.total_debit_mur -= take
+      else r.total_credit_mur -= take
+      remaining -= take
+      if (remaining <= 0.005) break
+    }
+    return amount - remaining // montant effectivement éliminé
+  }
+
+  for (const elim of eliminations) {
+    const rule = ELIM_RULES[elim.elimination_type]
+    if (!rule) continue
+    const amt = Number(elim.amount_mur) || 0
+    if (amt === 0) continue
+    // Une élimination = DR sur les comptes "debit" et CR sur les comptes "credit"
+    adjust(rule.debit,  'credit', amt) // on annule un crédit (ex : produit)
+    adjust(rule.credit, 'debit',  amt) // on annule un débit (ex : charge)
+  }
+  return [...map.values()].sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
+}
+
+// ─── IAS 21 : translation des sociétés étrangères vers la devise du groupe ───
+// On utilise les colonnes debit_mur / credit_mur déjà translatées par
+// ecritures_comptables_v2 (taux historique par écriture). Pour le consolidé,
+// on recalcule actif/passif au closing rate et P&L au taux moyen. L'écart
+// va en CTA (compte 1078).
+function classifyAccount(numero: string): 'monetary'|'non_monetary'|'pnl'|'equity'|'equity_cta'|'other' {
+  if (numero === '1078') return 'equity_cta'
+  if (/^5/.test(numero) || /^4[01234]/.test(numero) || /^16/.test(numero) || /^17/.test(numero) || /^46/.test(numero)) return 'monetary'
+  if (/^1[012345]/.test(numero)) return 'equity'
+  if (/^2/.test(numero) || /^3/.test(numero)) return 'non_monetary'
+  if (/^[678]/.test(numero)) return 'pnl'
+  return 'other'
+}
+
+async function computeTranslationAdjustment(
+  supabase: any, parentId: string, exercice: string,
+  relationships: any[],
+): Promise<{ cta_mur: number; per_subsidiary: any[] }> {
+  // Récupère la devise fonctionnelle du parent (devise de présentation du groupe)
+  const { data: parent } = await supabase.from('societes').select('devise_fonctionnelle').eq('id', parentId).single()
+  const groupCcy = parent?.devise_fonctionnelle || 'MUR'
+  const per_subsidiary: any[] = []
+  let cta_total = 0
+
+  for (const r of relationships) {
+    const childCcy = r.child?.devise_fonctionnelle || 'MUR'
+    if (childCcy === groupCcy) continue // pas de translation
+
+    // Pour chaque société étrangère, on récupère sa balance ventilée par
+    // classe IAS 21 et on simule la re-translation au closing rate.
+    // Note : closing_rate et average_rate doivent être stockés dans
+    // exchange_rates (cf. lib/accounting/functional-currency.ts). À défaut,
+    // on prend le dernier taux constaté dans ecritures_comptables_v2.
+    const { data: balance } = await supabase.rpc('consolidate_aggregate_per_societe', {
+      p_societe_id: r.child_societe_id, p_exercice: exercice,
+    }).catch(() => ({ data: [] }))
+
+    // Hypothèse minimale : reprendre debit_mur/credit_mur existants (taux
+    // historique par écriture) → CTA = écart vs closing rate. Pour la V1
+    // on calcule juste la différence ; le détail closing/average rate sera
+    // affiné par la RPC dédiée ias21_compute_cta_consolide à créer.
+    const { data: cta } = await supabase.rpc('ias21_compute_cta', {
+      p_societe_id: r.child_societe_id,
+      p_date_cloture: (exercice.substring(5) + '-06-30'),
+    })
+    const subCta = Number(cta?.[0]?.ecart_translation_mur || 0)
+    cta_total += subCta
+    per_subsidiary.push({
+      child_societe_id: r.child_societe_id,
+      devise_fonctionnelle: childCcy,
+      cta_mur: subCta,
+    })
+  }
+  return { cta_mur: cta_total, per_subsidiary }
+}

 export async function GET(request: Request) {
   try {
     const supabaseAuth = await createServerClient()
     const { data: { user } } = await supabaseAuth.auth.getUser()
     if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
     const { searchParams } = new URL(request.url)
     const parent_societe_id = searchParams.get('parent_societe_id')
     const exercice = searchParams.get('exercice')
     if (!parent_societe_id || !exercice) return NextResponse.json({ error: 'parent_societe_id et exercice requis' }, { status: 400 })

     const supabase = getAdminClient()
     const [{ data: relationships }, { data: aggregate }, { data: eliminations }, { data: nci }] = await Promise.all([
       supabase.from('societes_relationships').select('*, child:societes!child_societe_id(id, nom, devise_fonctionnelle)').eq('parent_societe_id', parent_societe_id).is('effective_to', null),
       supabase.rpc('consolidate_aggregate', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
       supabase.from('consolidation_eliminations').select('*').eq('parent_societe_id', parent_societe_id).eq('exercice', exercice),
       supabase.rpc('compute_nci', { p_parent_societe_id: parent_societe_id, p_exercice: exercice }),
     ])

-    // Apply eliminations
-    const elimMap = new Map<string, number>()
-    for (const elim of eliminations || []) {
-      // Each elimination is a debit/credit pair on certain accounts — for now we keep it simple
-      // and just expose them so the consumer can apply.
-    }
+    // ─── IFRS 10 §B86 — Application des éliminations intra-groupe ───
+    const aggregate_consolidated = applyEliminations(
+      (aggregate || []) as Row[],
+      eliminations || [],
+    )
+
+    // ─── IAS 21 §39 — Translation des filiales étrangères vers la devise du groupe ───
+    const translation = await computeTranslationAdjustment(
+      supabase, parent_societe_id, exercice, relationships || [],
+    )
+
+    // Ligne synthétique CTA à injecter dans le bilan consolidé (compte 1078)
+    if (Math.abs(translation.cta_mur) > 0.01) {
+      const existing = aggregate_consolidated.find(r => r.numero_compte === '1078')
+      if (existing) {
+        if (translation.cta_mur > 0) existing.total_credit_mur += translation.cta_mur
+        else existing.total_debit_mur += -translation.cta_mur
+      } else {
+        aggregate_consolidated.push({
+          numero_compte: '1078',
+          total_debit_mur:  translation.cta_mur < 0 ? -translation.cta_mur : 0,
+          total_credit_mur: translation.cta_mur > 0 ?  translation.cta_mur : 0,
+          contributing_societes: [],
+        })
+      }
+    }

     return NextResponse.json({
       parent_societe_id, exercice,
       relationships: relationships || [],
       consolidation_scope: { full: (relationships || []).filter((r: any) => r.consolidation_method === 'full').length },
-      aggregate: aggregate || [],
+      aggregate: aggregate || [],                  // brut (rétrocompat)
+      aggregate_consolidated,                       // post-élim + CTA
       eliminations: eliminations || [],
+      eliminations_applied_count: (eliminations || []).length,
+      translation_adjustment_mur: translation.cta_mur,
+      translation_per_subsidiary: translation.per_subsidiary,
       nci: nci || [],
       total_goodwill_mur: (relationships || []).reduce((s: number, r: any) => s + Number(r.goodwill_mur || 0), 0),
+      // Drapeau pour l'UI : afficher un avertissement si on a un déséquilibre résiduel
+      consolidation_balanced: Math.abs(
+        aggregate_consolidated.reduce((s, r) => s + r.total_debit_mur - r.total_credit_mur, 0)
+      ) < 1,
     })
   } catch (e: any) {
     return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
   }
 }
```

**À créer en complément** (hors patch — V1.1) :
- RPC PostgreSQL `consolidate_aggregate_per_societe(p_societe_id, p_exercice)` :
  même logique que `consolidate_aggregate` mais scope = 1 société.
- RPC `ias21_compute_cta_consolide(p_parent_id, p_exercice, p_closing_rates JSONB)`
  qui prend en argument les closing rates par devise et calcule un CTA par
  classe de poste (actif/passif/equity/PnL). Pour V1, on s'appuie sur
  `ias21_compute_cta` société par société (approximation grossière mais
  directionnellement correcte).
- Table `exchange_rates(devise, date, closing_rate, average_rate)` ou utilisation
  d'une RPC tierce déjà présente (cf. `lib/accounting/functional-currency.ts`
  qui n'a pas été audité ici).
- Page UI `/client/gbc-consolidation/eliminations` pour saisir les
  `consolidation_eliminations` (aujourd'hui inaccessible aux utilisateurs).
- Bandeau d'avertissement sur `/client/gbc-consolidation` si
  `consolidation_balanced === false` ou si des sociétés du périmètre ont
  une devise fonctionnelle ≠ celle du parent **et** `translation_adjustment_mur === 0`.

### 2.5 Test case proposé

| # | Société | Devise fonct. | Compte | Débit | Crédit | Commentaire |
|---|---|---|---|---:|---:|---|
| 1 | Holdco (parent) | USD | 411-Subco | 200 000 | 0 | Refacture management fees |
| 2 | Holdco | USD | 706-MgmtFees | 0 | 200 000 | Produit du management fee |
| 3 | Subco (100 %) | MUR | 401-Holdco | 0 | 200 000 | Dette envers Holdco |
| 4 | Subco | MUR | 622-MgmtFees | 200 000 | 0 | Charge management fees |
| 5 | Subco | MUR | 411-Holdco | 1 000 000 | 0 | Vente à Holdco |
| 6 | Subco | MUR | 706-Prestations | 0 | 1 000 000 | Produit de la vente |
| 7 | Holdco | USD | 401-Subco | 0 | 1 000 000 | Dette envers Subco |
| 8 | Holdco | USD | 604-Achats | 1 000 000 | 0 | Charge d'achat |

**Éliminations à enregistrer** :

| `elimination_type` | `from` | `to` | `amount_mur` |
|---|---|---|---:|
| `intra_revenue` | Subco | Holdco | 1 000 000 |
| `intra_cogs` | Holdco | Subco | 200 000 |
| `intra_ar_ap` | Subco | Holdco | 1 000 000 |
| `intra_ar_ap` | Holdco | Subco | 200 000 |

**Résultat attendu** (`aggregate_consolidated`, en MUR) :

| Compte | Débit brut | Crédit brut | Débit conso | Crédit conso |
|---|---:|---:|---:|---:|
| 401 | 0 | 1 200 000 | 0 | 0 |
| 411 | 1 200 000 | 0 | 0 | 0 |
| 604 | 1 000 000 | 0 | 0 | 0 |
| 622 | 200 000 | 0 | 0 | 0 |
| 706 | 0 | 1 200 000 | 0 | 0 |
| **Total** | **2 400 000** | **2 400 000** | **0** | **0** |

Le test devrait également vérifier :
- `consolidation_balanced === true`
- `translation_adjustment_mur ≠ 0` (parce que Holdco est en USD) — montant
  précis dépend du taux de clôture utilisé.

---

## 3. Effort, risque, régression

| Critère | Valeur |
|---|---|
| **Complexité** | **Moyenne à forte** |
| **Effort dev V1** (patch ci-dessus + tests unitaires Jest sur `applyEliminations`) | **3 jours** |
| **Effort V1.1** (RPC `consolidate_aggregate_per_societe`, page de saisie d'éliminations, intégration `exchange_rates`, bandeau UI) | **5 jours additionnels** |
| **Effort V2 complet** (CTA par classe de poste, écritures de translation persistées, IFRS 3 fair value adjustment, IAS 36 impairment du goodwill) | **2 à 3 semaines** |
| **Risque régulatoire actuel** | **MAJEUR** — états financiers consolidés faux, sanction FSC potentielle (MUR 1 M + suspension licence), PER 80 % requalifiable rétroactivement par la MRA |
| **Risque de régression du patch V1** | **Faible** — additif, on ne touche pas à `aggregate` (rétrocompat), on ajoute `aggregate_consolidated`. Les consommateurs (page `/client/gbc-consolidation`) ne lisent aujourd'hui que `eliminations.length`, `nci`, `total_goodwill_mur` et `consolidation_scope` → non impactés. La nouvelle UI à brancher pour exploiter `aggregate_consolidated`. |
| **Risque sur les sociétés `domestic`** | **Nul** — la route est branchée derrière `regime ∈ (gbc1, authorised_company, holding)`. Vérifier toutefois en code : `applyEliminations` sur un tableau vide d'éliminations retourne l'agrégat inchangé. |
| **Couverture de test exigée** | unitaires (8 cas : 1 par `elimination_type`) + 1 cas d'intégration (le scénario 2.5 ci-dessus) + 1 cas de balance déséquilibrée |
| **Dépendance** | besoin que `ias21_compute_cta` (mig 249) soit bien déployée en prod sur `dqepdoimpqhmuhkklxva` |

---

## 4. Récapitulatif

- **Chemin du rapport** : `/home/user/v0-lexora-accounting-saa-s/docs/audit-partials/wave2-E-ifrs10-conso.md`
- **Fichier à patcher** : `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/gbc/consolidate/route.ts`
- **Complexité** : moyenne à forte (V1 simple, V2 complète nécessite du PG/PLpgSQL)
- **Risque régulatoire** : **MAJEUR** (faux états financiers consolidés publiés)
- **Priorité** : **P0** — à corriger avant la prochaine clôture exercice pour tout client GBC en cours d'audit
- **Non-régression à vérifier** : sociétés `domestic` (le code n'est en théorie pas exécuté pour elles, mais à confirmer côté frontend / sidebar `requiredRegime`)
