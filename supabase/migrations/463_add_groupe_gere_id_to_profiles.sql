-- Mig 463 — Ajoute profiles.groupe_gere_id (rétro-fix mig 045 jamais appliquée)
--
-- BUG : la colonne profiles.groupe_gere_id était attendue par le code
-- (lib/rh/ownership.ts ligne 44 : .select('employe_id, role, groupe_gere_id'))
-- mais n'a jamais été créée en prod. La mig 045 qui devait l'ajouter n'a
-- pas tourné. Conséquence : le SELECT échoue silencieusement avec une
-- erreur 42703 (column does not exist), data = null → ownership.role = ''
-- → isRH = false → TOUS les RH/admin/manager perdent leurs droits de
-- pointer/manager des employés (la canManageEmploye retourne false sauf
-- pour soi-même).
--
-- CAS OBSERVÉ (23.06.2026) : Marie Suzelle PIERRE ne pouvait pas
-- pointer pour elle-même ET le RH ne pouvait pas pointer pour elle —
-- même message d'erreur "Accès refusé — vous ne pouvez pointer que
-- pour vous-même."
--
-- FIX : ajoute la colonne nullable. Aucune régression : les profils
-- existants restent NULL → ils ne sont pas considérés comme
-- manager_scoped (comportement actuel inchangé). Les RH/admin
-- retrouvent leurs droits car le SELECT cesse d'échouer.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS groupe_gere_id UUID NULL;

COMMENT ON COLUMN public.profiles.groupe_gere_id IS
  'ID du groupe géré par un manager/team_leader (lib/rh/ownership.ts). '
  'NULL = pas de scope groupe. Mig 463 (rattrape mig 045).';
