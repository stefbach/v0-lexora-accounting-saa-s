-- 462_gl_balance_rpc.sql
-- Scalabilité : agrégat de balance des comptes côté SQL (au lieu de charger
-- toutes les écritures dans Node et sommer en JS — cf. audit scalabilité).
--
-- Remplace la boucle paginée `while(true)` de
-- app/api/societes/[societe_id]/grand-livre/balance/route.ts : une seule
-- requête GROUP BY, couverte par l'index existant
-- idx_ecritures_v2_composite (societe_id, numero_compte, date_ecriture)
-- INCLUDE (debit_mur, credit_mur, lettre).
--
-- O(écritures) transférées → O(comptes) (~quelques centaines de lignes).
-- SECURITY INVOKER : appelée avec le client admin (service role) APRÈS
-- assertSocieteAccess côté route — comportement d'accès inchangé.

CREATE OR REPLACE FUNCTION public.gl_balance_par_compte(
  p_societe_id uuid,
  p_date_debut date DEFAULT NULL,
  p_date_fin   date DEFAULT NULL,
  p_classe     text DEFAULT NULL
)
RETURNS TABLE (
  numero_compte text,
  nom_compte    text,
  debit         numeric,
  credit        numeric,
  solde         numeric,
  nb_ecritures  bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.numero_compte,
    max(e.nom_compte)                                              AS nom_compte,
    round(coalesce(sum(e.debit_mur), 0)::numeric, 2)              AS debit,
    round(coalesce(sum(e.credit_mur), 0)::numeric, 2)            AS credit,
    round(coalesce(sum(e.debit_mur) - sum(e.credit_mur), 0)::numeric, 2) AS solde,
    count(*)                                                       AS nb_ecritures
  FROM public.ecritures_comptables_v2 e
  WHERE e.societe_id = p_societe_id
    AND e.numero_compte IS NOT NULL
    AND (p_date_debut IS NULL OR e.date_ecriture >= p_date_debut)
    AND (p_date_fin   IS NULL OR e.date_ecriture <= p_date_fin)
    AND (p_classe IS NULL OR left(e.numero_compte, 1) = p_classe)
  GROUP BY e.numero_compte;
$$;

COMMENT ON FUNCTION public.gl_balance_par_compte(uuid, date, date, text) IS
  'Balance des comptes (débit/crédit/solde) agrégée en SQL sur une période, '
  'optionnellement filtrée par classe. Remplace l''agrégation JS de la route '
  'grand-livre/balance (audit scalabilité, mig 462).';

GRANT EXECUTE ON FUNCTION public.gl_balance_par_compte(uuid, date, date, text)
  TO authenticated, service_role;
