-- ============================================================================
-- Migration 511 — Jours fériés Maurice 2027 (arrêté du Cabinet)
-- ============================================================================
-- Liste officielle 2027. Particularités vs 2026 :
--   - 2027 a la TOUSSAINT (All Saints Day, 01/11) et PAS l'Assomption.
--   - Ganesh Chaturthi tombe le dimanche 05/09 → férié observé le lundi 06/09
--     (Public Holidays Act, section 3(3), amendé en 2026).
-- societe_id NULL = s'applique à toutes les sociétés.
-- Idempotente : n'insère que les dates absentes.
-- ============================================================================

INSERT INTO public.jours_feries (date, libelle, pays, travail_autorise, majoration_pct, societe_id)
SELECT v.date::date, v.libelle, 'MU', false, 100, NULL
FROM (VALUES
  ('2027-01-01','New Year''s Day'),
  ('2027-01-02','New Year Holiday'),
  ('2027-01-22','Thaipoosam Cavadee'),
  ('2027-02-01','Abolition of Slavery'),
  ('2027-02-06','Chinese Spring Festival'),
  ('2027-03-06','Maha Shivaratree'),
  ('2027-03-10','Eid-Ul-Fitr'),
  ('2027-03-12','Independence Day and Republic Day'),
  ('2027-04-07','Ougadi'),
  ('2027-05-01','Labour Day'),
  ('2027-09-06','Ganesh Chaturthi'),
  ('2027-10-29','Divali'),
  ('2027-11-01','All Saints Day'),
  ('2027-11-02','Arrival of Indentured Labourers'),
  ('2027-12-25','Christmas')
) AS v(date, libelle)
WHERE NOT EXISTS (
  SELECT 1 FROM public.jours_feries jf
  WHERE jf.date = v.date::date AND jf.societe_id IS NULL
);
