-- =============================================================================
-- Migration 264 — Vue d'usage Telegram 30j (cost / activity tracking)
-- =============================================================================
-- Permet à l'admin / direction de voir :
--   - nb actions Telegram par société sur 30 jours
--   - succès / refus / erreurs
--   - top intents
--   - durée moyenne par intent (proxy de coût)
--
-- Idempotent — DROP/CREATE.

DROP VIEW IF EXISTS public.vw_telegram_usage_30d;

CREATE OR REPLACE VIEW public.vw_telegram_usage_30d AS
SELECT
  societe_id,
  COUNT(*)::int                                          AS actions_total,
  COUNT(*) FILTER (WHERE status = 'success')::int        AS actions_success,
  COUNT(*) FILTER (WHERE status = 'denied')::int         AS actions_denied,
  COUNT(*) FILTER (WHERE status = 'error')::int          AS actions_error,
  COUNT(DISTINCT user_id)::int                           AS distinct_users,
  COUNT(DISTINCT intent)::int                            AS distinct_intents,
  ROUND(AVG(duration_ms))::int                           AS avg_duration_ms,
  MAX(created_at)                                        AS last_action_at
FROM public.telegram_actions
WHERE created_at >= now() - interval '30 days'
  AND societe_id IS NOT NULL
GROUP BY societe_id;

-- =============================================================================
-- Vue détaillée par intent (top 20 par société)
-- =============================================================================
DROP VIEW IF EXISTS public.vw_telegram_intents_30d;

CREATE OR REPLACE VIEW public.vw_telegram_intents_30d AS
SELECT
  societe_id,
  intent,
  COUNT(*)::int                                          AS n,
  COUNT(*) FILTER (WHERE status = 'success')::int        AS n_success,
  COUNT(*) FILTER (WHERE status = 'error')::int          AS n_error,
  ROUND(AVG(duration_ms))::int                           AS avg_ms
FROM public.telegram_actions
WHERE created_at >= now() - interval '30 days'
  AND societe_id IS NOT NULL
GROUP BY societe_id, intent
ORDER BY societe_id, n DESC;

COMMENT ON VIEW public.vw_telegram_usage_30d IS
  'Agrégation usage bot Telegram 30j par société. Lu par /api/admin/telegram/health-check et UI permissions.';
COMMENT ON VIEW public.vw_telegram_intents_30d IS
  'Détail par intent sur 30j — utile pour identifier les actions les plus utilisées et les sources d''erreurs.';
