-- Migration 030 : Multi-comptables — assignation comptable <-> societes

-- Table pivot comptable <-> societes
CREATE TABLE IF NOT EXISTS public.comptable_societes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comptable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type_acces TEXT NOT NULL DEFAULT 'comptable' CHECK (type_acces IN ('comptable', 'comptable_dedie', 'lecture')),
  date_assignation TIMESTAMPTZ DEFAULT NOW(),
  assigne_par UUID REFERENCES public.profiles(id),
  actif BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE(comptable_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_cs_comptable ON public.comptable_societes(comptable_id);
CREATE INDEX IF NOT EXISTS idx_cs_societe ON public.comptable_societes(societe_id);

ALTER TABLE public.comptable_societes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_cs" ON public.comptable_societes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "comptable_read_own_cs" ON public.comptable_societes FOR SELECT USING (
  comptable_id = auth.uid()
);

-- Vue portefeuille comptable
CREATE OR REPLACE VIEW public.vue_comptable_portefeuille AS
SELECT
  cs.id AS assignation_id,
  cs.comptable_id,
  p.full_name AS comptable_nom,
  p.email AS comptable_email,
  cs.societe_id,
  s.nom AS societe_nom,
  s.brn,
  s.ern,
  cs.type_acces,
  cs.date_assignation,
  cs.actif,
  (SELECT COUNT(*) FROM public.dossiers d WHERE d.societe_id = cs.societe_id AND d.statut = 'en_cours') AS nb_dossiers_en_cours,
  (SELECT MAX(date_ecriture) FROM public.ecritures_comptables_v2 e WHERE e.societe_id = cs.societe_id) AS derniere_ecriture,
  (SELECT COUNT(*) FROM public.documents doc WHERE doc.societe_id = cs.societe_id AND doc.statut = 'en_attente') AS docs_en_attente
FROM public.comptable_societes cs
JOIN public.profiles p ON p.id = cs.comptable_id
JOIN public.societes s ON s.id = cs.societe_id
WHERE cs.actif = TRUE;

-- Table parametres plateforme (pour admin/parametres persistance)
CREATE TABLE IF NOT EXISTS public.parametres_plateforme (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cle TEXT UNIQUE NOT NULL,
  valeur JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parametres_plateforme ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only_params" ON public.parametres_plateforme FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
