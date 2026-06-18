-- Mig 462 — Fix `user_has_societe_access` : prendre en compte le rôle du user
--
-- BUG : la version actuelle (mig 404, raffinée plus tard) ne considère QUE
-- les liens explicites (is_global_admin, user_societes, dossiers,
-- societes.created_by). Les rôles RH (rh, rh_manager, manager, team_leader,
-- client_admin) qui dépendent du fallback "via clients" (cf. lib/rh/access.ts
-- userHasAccessToSociete ligne 84) recevaient un 403 sur toutes les RLS qui
-- utilisent cette fonction (notamment pointages, ecritures_comptables_v2,
-- factures, etc.).
--
-- CAS OBSERVÉ : Summer (rôle 'rh') ne pouvait pas faire de pointage pour les
-- salariés depuis l'espace RH — la RLS sur pointages (mig 415) bloquait
-- l'INSERT car user_has_societe_access retournait false faute de lien
-- explicite alors qu'elle avait bien accès via la table `clients`.
--
-- FIX : aligner la fonction SQL sur la logique TypeScript :
--   1. is_global_admin (admin/super_admin) : accès total — conservé
--   2. Liens explicites : conservés (user_societes, dossiers, created_by)
--   3. Comptable / comptable_dedie : via comptable_societes — ajouté
--   4. RH / manager / client_admin / direction : via clients (user_id) →
--      societes (client_id) — ajouté
--
-- IMPACT : élargit l'accès pour les rôles RH/manager/comptable légitimement
-- liés à un client. Aucun impact négatif sur l'isolation tenant (un user
-- sans aucun lien continue de ne rien voir).

CREATE OR REPLACE FUNCTION public.user_has_societe_access(p_societe UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $func$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      -- 1. Admin global
      public.is_global_admin()
      -- 2. Liens explicites historiques
      OR EXISTS (
        SELECT 1 FROM public.user_societes us
        WHERE us.user_id = auth.uid() AND us.societe_id = p_societe
      )
      OR EXISTS (
        SELECT 1 FROM public.societes s
        WHERE s.id = p_societe AND s.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.dossiers d
        WHERE d.societe_id = p_societe AND d.client_id = auth.uid()
      )
      -- 3. Comptable / comptable_dedie via comptable_societes (mig 462)
      OR EXISTS (
        SELECT 1
          FROM public.profiles pr
          JOIN public.comptable_societes cs ON cs.comptable_id = auth.uid()
         WHERE pr.id = auth.uid()
           AND pr.role IN ('comptable', 'comptable_dedie')
           AND cs.societe_id = p_societe
      )
      -- 4. RH / manager / client_admin / direction via clients → societes (mig 462)
      OR EXISTS (
        SELECT 1
          FROM public.profiles pr
          JOIN public.clients cl ON cl.user_id = auth.uid()
          JOIN public.societes s ON s.client_id = cl.id
         WHERE pr.id = auth.uid()
           AND pr.role IN (
             'client_admin', 'client_user',
             'rh', 'rh_manager',
             'manager', 'team_leader',
             'direction'
           )
           AND s.id = p_societe
      )
    );
$func$;

COMMENT ON FUNCTION public.user_has_societe_access(UUID) IS
  'Vérifie l''accès d''un utilisateur à une société. Inclut : admin global, '
  'liens explicites (user_societes, dossiers, created_by), comptable via '
  'comptable_societes, RH/manager/direction via clients (mig 462).';
