-- ═══════════════════════════════════════════════════════════════
-- Migration 127: Alias fournisseurs dynamiques (multi-tenant)
--
-- Les alias ne sont plus hardcodés dans le code. Chaque société
-- gère ses propres correspondances nom_banque ↔ nom_comptable.
-- Des alias globaux (communs à Maurice) sont pré-seedés.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.supplier_aliases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  -- NULL = alias global (commun à toutes les sociétés)

  -- Groupe d'alias : tous les noms qui désignent le même tiers
  canonical    TEXT NOT NULL,        -- nom canonique (ex: "mauritius telecom")
  alias        TEXT NOT NULL,        -- un alias (ex: "myt", "cellplus", "my.t")

  -- Métadonnées
  source       TEXT DEFAULT 'manual', -- 'manual' | 'auto_learned' | 'seed'
  confidence   NUMERIC DEFAULT 1.0,
  nb_used      INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Un alias ne peut exister qu'une fois par société (ou global)
  UNIQUE(societe_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_supplier_aliases_societe ON public.supplier_aliases(societe_id);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_canonical ON public.supplier_aliases(canonical);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_alias ON public.supplier_aliases(alias);

ALTER TABLE public.supplier_aliases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY supplier_aliases_read ON public.supplier_aliases
    FOR SELECT USING (
      societe_id IS NULL  -- global aliases readable by everyone
      OR EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid()
                   AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY supplier_aliases_write ON public.supplier_aliases
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
                AND role IN ('admin','super_admin','comptable','comptable_dedie','client_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed : alias globaux communs à Maurice ──────────────────
-- societe_id = NULL → disponible pour toutes les sociétés
INSERT INTO public.supplier_aliases (societe_id, canonical, alias, source) VALUES
  -- Telecom
  (NULL, 'mauritius telecom', 'myt', 'seed'),
  (NULL, 'mauritius telecom', 'my.t', 'seed'),
  (NULL, 'mauritius telecom', 'mauritius telecom', 'seed'),
  (NULL, 'mauritius telecom', 'cellplus', 'seed'),
  (NULL, 'mauritius telecom', 'cellplus mobile', 'seed'),
  (NULL, 'mauritius telecom', 'cellplus mobile communications', 'seed'),
  (NULL, 'mauritius telecom', 'myt mauritius telecom', 'seed'),
  (NULL, 'emtel', 'emtel', 'seed'),
  (NULL, 'emtel', 'emtel ltd', 'seed'),
  (NULL, 'emtel', 'emtel limited', 'seed'),
  -- Banques
  (NULL, 'mcb', 'mcb', 'seed'),
  (NULL, 'mcb', 'mauritius commercial bank', 'seed'),
  (NULL, 'sbm', 'sbm', 'seed'),
  (NULL, 'sbm', 'state bank of mauritius', 'seed'),
  (NULL, 'sbm', 'sbm bank', 'seed'),
  -- Services publics
  (NULL, 'ceb', 'ceb', 'seed'),
  (NULL, 'ceb', 'central electricity board', 'seed'),
  (NULL, 'cwa', 'cwa', 'seed'),
  (NULL, 'cwa', 'central water authority', 'seed'),
  -- Gouvernement
  (NULL, 'mra', 'mra', 'seed'),
  (NULL, 'mra', 'mauritius revenue authority', 'seed'),
  (NULL, 'mra', 'mauritius revenue', 'seed'),
  -- Cloud / Tech (courants à Maurice)
  (NULL, 'google cloud', 'google', 'seed'),
  (NULL, 'google cloud', 'google cloud', 'seed'),
  (NULL, 'google cloud', 'google cloud emea', 'seed'),
  (NULL, 'google cloud', 'google cloud emea limited', 'seed')
ON CONFLICT (societe_id, alias) DO NOTHING;

COMMENT ON TABLE public.supplier_aliases IS 'Alias fournisseurs dynamiques — permet au moteur de rapprochement de reconnaître qu''un même fournisseur peut apparaître sous différents noms dans la banque vs les factures. societe_id NULL = alias global.';
