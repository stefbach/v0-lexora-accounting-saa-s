# Migrations à appliquer — Wave 1 + Salve 3

> Note : cible initiale `.claude/notes/migrations-a-appliquer.md` mais le
> sandbox de l'agent Claude Code a bloqué toute écriture dans `.claude/`.
> Placé à la racine du repo en fallback (déplacer à la main vers
> `.claude/notes/` au besoin).

Exécuter dans l'ordre via Supabase CLI ou dashboard SQL :

```bash
# Wave 1 (déjà pushé)
supabase db push
# ou manuellement dans l'ordre :
supabase migration up 146_factures_numero_sequence
supabase migration up 147_factures_dedup_unique
supabase migration up 148_factures_statuts_workflow
supabase migration up 149_relances_factures

# Salve 3 (pushé plus tard)
supabase migration up 150_lettres_operations_audit
supabase migration up 151_lettrage_r7_enforcement
supabase migration up 152_grand_livre_perf_indexes
```

## Vérifications post-migration

```sql
-- 146: vérifier la séquence
SELECT * FROM pg_proc WHERE proname = 'get_next_facture_number';

-- 147: vérifier l'index de dédup
SELECT indexname FROM pg_indexes WHERE tablename = 'factures' AND indexname LIKE '%dedup%';

-- 148: vérifier la colonne
SELECT column_name FROM information_schema.columns WHERE table_name = 'factures' AND column_name = 'statut_workflow';

-- 150: vérifier table audit
SELECT to_regclass('public.lettres_operations');

-- 151: vérifier trigger R7
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%lettrage_r7%';

-- 152: vérifier index composite
SELECT indexname FROM pg_indexes WHERE tablename = 'ecritures_comptables_v2' AND indexname LIKE '%composite%';
```

## Rollback (si besoin, MANUEL)
Pas de fichiers .down.sql — DROP à la main si rollback nécessaire.
