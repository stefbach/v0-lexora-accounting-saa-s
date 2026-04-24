# Triggers & fonctions SQL

Cette doc liste les triggers actifs sur les tables comptables, les fonctions SQL
critiques qui encapsulent de la logique métier, et les gotchas à connaître avant
d'ajouter ou modifier quoi que ce soit.

Les triggers sont la source la plus fréquente de bugs "inexplicables" dans ce
projet. Plusieurs fossiles (dont `tr_ecritures_canonicalize_compte`) ont été
découverts en prod lors d'audits. Cette doc est censée éviter à un futur dev de
perdre 2h à comprendre pourquoi son UPDATE ne persiste pas.

## Table des matières

- [Triggers sur ecritures_comptables_v2](#triggers-sur-ecritures_comptables_v2)
- [Triggers sur ecritures_comptables (vue v1)](#triggers-sur-ecritures_comptables-vue-v1)
- [Triggers sur bulletins_paie](#triggers-sur-bulletins_paie)
- [Fonctions SQL métier](#fonctions-sql-métier)
- [Ordre d'exécution et gotchas](#ordre-dexécution-et-gotchas)

---

## Triggers sur ecritures_comptables_v2

### `tr_00_legacy_3digit_warn` (mig 165, anciennement 162)

| Champ | Valeur |
|---|---|
| Timing | `BEFORE INSERT OR UPDATE OF numero_compte` |
| Fonction | `trg_warn_legacy_3digit_compte()` |
| Rôle | Garde-fou non-bloquant : si un code 3-digits bare est inséré (`421`, `431`, `432`, `433`, `444`), remappe silencieusement vers le PCM 4-digits équivalent + émet un `RAISE WARNING`. |
| Préfixe `00` | Garantit que ce trigger fire AVANT `tr_ecritures_remap_pcm` (ordre alphabétique par nom) — le warn traite d'abord les 3-digits, ensuite remap_pcm traite les 6-digits. |
| Migration | `165_trigger_warn_legacy_3digit.sql` |

Mappings automatiques :
- `421` → `4210` (Salaires nets)
- `431` + libellé CSG/NSF/patronal → `4311/4312/4321/4322`
- `432` + libellé PRGF/Levy → `4323/4324`
- `433` / `444` → `4330`

### `tr_ecritures_remap_pcm` (mig 144)

| Champ | Valeur |
|---|---|
| Timing | `BEFORE INSERT OR UPDATE OF numero_compte` |
| Fonction | `trg_remap_compte_pcm()` |
| Rôle | Remap les codes 6-digits legacy (`421000`, `431100`, `447200`…) vers le PCM 4-digits (`4210`, `4312`, `4330`…) via la table `compte_remap_pcm`. |
| Comportement | Si le code n'est pas dans `compte_remap_pcm` (ex: `4210` déjà canonique), retourne tel quel. |
| Migration | `144_integrite_comptable_comptes_canoniques.sql` |

### ⚠ `tr_ecritures_canonicalize_compte` (FOSSILE — à vérifier)

| Champ | Valeur |
|---|---|
| État | Devrait être **supprimé par mig 144** (`DROP TRIGGER IF EXISTS`) |
| Risque | Sur certaines bases la mig 144 n'a pas été appliquée → ce trigger persiste et **réécrit silencieusement `4210` en `421`** à chaque UPDATE. |
| Symptôme | Un `UPDATE SET numero_compte='4210'` avec `RETURNING` affiche `421` au lieu de `4210`. |

**Diagnostic** :
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.ecritures_comptables_v2'::regclass
  AND tgname = 'tr_ecritures_canonicalize_compte'
  AND NOT tgisinternal;
```

**Fix si présent** :
```sql
DROP TRIGGER IF EXISTS tr_ecritures_canonicalize_compte ON public.ecritures_comptables_v2;
DROP FUNCTION IF EXISTS public.trg_canonicalize_numero_compte() CASCADE;
```

### `tr_balance_check_insert` + `tr_balance_check_update` (mig 166+168)

| Champ | Valeur |
|---|---|
| Timing INSERT | `AFTER INSERT ... REFERENCING NEW TABLE AS new_table FOR EACH STATEMENT` |
| Timing UPDATE | `AFTER UPDATE ... REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table FOR EACH STATEMENT` |
| Fonctions | `trg_check_balance_ref_folio_insert()` / `trg_check_balance_ref_folio_update()` |
| Rôle | Vérifie l'équilibre `Σ debit = Σ credit` par `ref_folio` après chaque batch. Émet un `RAISE WARNING` si écart > 0.01 MUR. |
| Exclusions | `ref_folio LIKE 'BANK-%'` (paiements groupés N:1) + `journal IN ('CLS', 'BNQ')` (classifications auto). |

⚠ **Pourquoi 2 fonctions distinctes** : PostgreSQL refuse la combinaison
`UPDATE OF col1, col2` + `REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table`
(erreur `0A000: transition tables cannot be specified for triggers with column lists`).
La fonction INSERT ne référence que `new_table`, la fonction UPDATE référence les deux.

### `trg_enforce_r7_lettre_v2`

| Champ | Valeur |
|---|---|
| Timing | `BEFORE INSERT OR UPDATE OF lettre` |
| Condition WHEN | `(NEW.lettre IS NOT NULL)` |
| Fonction | `fn_enforce_r7_no_lettre_resultat()` |
| Rôle | Enforcée la règle R7 : impossible de poser une `lettre` sur une écriture de classe 6 (charges) ou 7 (produits). Toute tentative → `RAISE EXCEPTION`. |

### `trg_log_lettre_change`

| Champ | Valeur |
|---|---|
| Timing | `AFTER INSERT OR UPDATE OF lettre` |
| Rôle | Audit trail : enregistre chaque changement de lettrage dans `rapprochement_audit_log` pour traçabilité légale. |

---

## Triggers sur ecritures_comptables (vue v1)

Depuis mig 120, `ecritures_comptables` est une **VUE** sur `ecritures_comptables_v2`
avec des triggers INSTEAD OF pour maintenir la compatibilité avec le code v1 qui
écrit encore avec les noms de colonnes legacy (`compte`, `debit`, `credit`).

### `ecritures_comptables_insert_trigger`

| Champ | Valeur |
|---|---|
| Timing | `INSTEAD OF INSERT` |
| Fonction | `ecritures_comptables_insert_v1_compat()` |
| Rôle | Convertit `compte` → `numero_compte`, `debit` → `debit_mur`, `credit` → `credit_mur`, etc., puis INSERT dans v2. Résout `societe_id` depuis `dossier_id` si pas fourni. |
| Migration | `120_unify_ecritures_v2.sql` |

### `ecritures_comptables_update_trigger` / `ecritures_comptables_delete_trigger`

Mêmes patterns pour UPDATE et DELETE via la vue.

⚠ **Gotcha** : ces triggers **NE PROPAGENT PAS** les colonnes freeze (`taux_change_applique`,
`devise_origine`, `montant_origine`) ajoutées par mig 172. Si tu INSERT via
`ecritures_comptables` (v1), ces 3 colonnes sont **perdues**. Fix dans le code
TS : `sync_lettrage` a été basculé sur `ecritures_comptables_v2` direct (commit
`89cc4a3`) pour préserver les freeze columns.

---

## Triggers sur bulletins_paie

### `trg_auto_verrouille_bulletin` (ACTIF)

| Champ | Valeur |
|---|---|
| Timing | `BEFORE UPDATE OF statut` |
| Fonction | `fn_auto_verrouille_bulletin()` |
| Rôle | Empêche de modifier un bulletin dont le statut est déjà `valide` ou `comptabilise` (sécurité). |

### `trig_ecritures_paie` (⚠ DÉSACTIVÉ — mig 169)

| Champ | Valeur |
|---|---|
| Timing | `AFTER UPDATE` |
| Condition | `NEW.statut = 'valide' AND OLD.statut IS DISTINCT FROM 'valide'` |
| Fonction | `trigger_ecritures_paie()` → appelle `generer_ecritures_paie(NEW.id)` |
| État | **DISABLED** depuis mig 169 |
| Pourquoi | Générait des écritures `OD-PAIE` par bulletin en **plus** du pipeline `SAL` agrégé mensuel (`/api/rh/import-paie`) → doublons sur classes 42xx/43xx. |
| Ré-activation | `ALTER TABLE bulletins_paie ENABLE TRIGGER trig_ecritures_paie`. **Avant** : purger les SAL existants sinon doublons immédiats. |

---

## Fonctions SQL métier

### `generer_ecritures_paie(p_bulletin_id UUID) RETURNS INTEGER`

| Champ | Valeur |
|---|---|
| Migration d'origine | `018_plan_comptable_paie.sql` |
| Ré-écrite | mig 029 (dual V1/V2), mig 120 (V2-only), mig 163 (PCM 4-digits) |
| Idempotence | `DELETE FROM ecritures_comptables_v2 WHERE ref_folio = 'BP-<bulletin_id>'` avant INSERT |
| Journal | `OD-PAIE` |
| Ref_folio | `BP-<bulletin_id>` |
| Écritures produites | 19 lignes typiques : 6411/6412/6413/6414/6415/6416 débits + 6451-6454 débits + contreparties 4210/4311/4312/4321/4322/4323/4324/4330 crédits |
| Statut appel auto | Le trigger `trig_ecritures_paie` qui l'appelle est DÉSACTIVÉ (mig 169). Appelable manuellement en RPC via `supabase.rpc('generer_ecritures_paie', {p_bulletin_id})`. |

### `remap_compte_pcm(p_compte TEXT) RETURNS TEXT`

| Champ | Valeur |
|---|---|
| Migration | `144_integrite_comptable_comptes_canoniques.sql` |
| Comportement | `SELECT pcm_code FROM compte_remap_pcm WHERE legacy_code = TRIM(p_compte)` — retourne le 4-digits si match, sinon retourne p_compte inchangé. |
| STABLE | Oui (deterministic par input, cacheable par PG) |

### `trg_remap_compte_pcm()`

Fonction trigger qui wrappe `remap_compte_pcm()` pour l'appliquer à chaque INSERT/UPDATE.

### `trg_warn_legacy_3digit_compte()`

| Champ | Valeur |
|---|---|
| Migration | `165` |
| Comportement | Remappe les codes 3-digits bare vers 4-digits + `RAISE WARNING` visible dans les logs Supabase. |

### `trg_check_balance_ref_folio_insert()` / `_update()`

| Champ | Valeur |
|---|---|
| Migrations | `166` (création) + `168` (fix erreur 0A000) |
| Comportement | Parcourt les `ref_folio` affectés par le statement courant, calcule `Σ debit - Σ credit`, émet `RAISE WARNING` si écart > 0.01 MUR. |
| Bloquant ? | Non — WARNING seulement. Permet à l'application de gérer les cas edge (paiements groupés, classifications) sans casser. |

### `fn_enforce_r7_no_lettre_resultat()`

| Champ | Valeur |
|---|---|
| Comportement | Si `NEW.numero_compte LIKE '6%' OR NEW.numero_compte LIKE '7%'` ET `NEW.lettre IS NOT NULL` → `RAISE EXCEPTION 'R7: pas de lettrage sur comptes de résultat'`. |

### `fn_log_lettre_change()`

Audit trail AFTER : INSERT un row dans `rapprochement_audit_log` avec `action='lettre_change'`, before/after, user_id.

### `fn_auto_verrouille_bulletin()`

Bloque l'UPDATE si `OLD.statut IN ('valide', 'comptabilise')`.

---

## Ordre d'exécution et gotchas

### Ordre d'exécution sur BEFORE INSERT/UPDATE OF numero_compte

PostgreSQL exécute les triggers du même timing par ordre alphabétique par nom :

1. **`tr_00_legacy_3digit_warn`** — préfixe `00` garantit la priorité
2. **`tr_ecritures_remap_pcm`**

Flux pour un INSERT avec `numero_compte = '421'` (3-digit bare) :
- Trigger 1 détecte length=3 → remap vers `4210` + WARNING
- Trigger 2 reçoit `NEW.numero_compte = '4210'` → pas dans `compte_remap_pcm`, laisse tel quel

Flux pour un INSERT avec `numero_compte = '421000'` (6-digit legacy) :
- Trigger 1 détecte length=6 → pas 3-digit, passe sans rien faire
- Trigger 2 trouve `421000` dans `compte_remap_pcm` → remappe en `4210`

### Gotcha : partial unique index sur ref_folio

```sql
ux_ecritures_v2_ref_folio
ON ecritures_comptables_v2 (societe_id, ref_folio, numero_compte)
WHERE ref_folio IS NOT NULL
```

Pour utiliser `ON CONFLICT` avec cet index, il FAUT répéter la clause `WHERE` :

```sql
INSERT INTO ecritures_comptables_v2 (...)
VALUES (...)
ON CONFLICT (societe_id, ref_folio, numero_compte)
WHERE (ref_folio IS NOT NULL)  -- OBLIGATOIRE sinon erreur 42P10
DO NOTHING;
```

Sans le `WHERE` → erreur `42P10 no unique or exclusion constraint matching`.

### Gotcha : vue v1 perd les freeze columns

Un INSERT via la vue `ecritures_comptables` (v1) passe par le trigger INSTEAD OF
qui ne mappe que les colonnes legacy. Les 3 nouvelles colonnes `taux_change_applique`,
`devise_origine`, `montant_origine` (mig 172) sont ignorées.

**Conclusion** : tout nouveau code doit INSERT directement dans `ecritures_comptables_v2`.

### Gotcha : triggers warning mais pas bloquants

Les triggers `tr_balance_check_*` émettent des `RAISE WARNING` visibles dans
les logs Supabase, mais **n'annulent pas** la transaction. C'est voulu : les
paiements groupés et classifications auto ont des patterns qui peuvent être
déséquilibrés temporairement. À monitorer via logs, pas comme enforcement.
