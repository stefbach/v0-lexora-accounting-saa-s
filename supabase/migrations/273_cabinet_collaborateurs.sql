-- ═══════════════════════════════════════════════════════════════════════
-- Migration 273 — Cabinet : collaborateurs, accès par client, notes, tags
--
-- Demande utilisateur :
--   "un comptable plusieurs clients et plusieurs collaborateurs et
--    affectations pour chaque collaborateurs des clients … il peut aussi
--    gerer les acces compta uniquement ou rh uniquement ou les deux"
--
-- Modèle simple (choix utilisateur) :
--   - PAS de table cabinets dédiée
--   - profiles.parent_comptable_id rattache un collaborateur à son
--     comptable dirigeant (qui est lui-même un profile role=comptable)
--   - cabinet_collaborateurs_acces : pour CHAQUE couple (collab, client),
--     on choisit le scope compta / rh / both → granularité par client
--   - cabinet_notes : notes internes du cabinet par client (non visibles
--     du client final)
--   - cabinet_tags + cabinet_tag_assignments : tags personnalisables
--     ("VIP", "Risque", "Lent payeur") attribués aux clients
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Rattachement collaborateur → comptable dirigeant
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_comptable_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_parent_comptable
  ON public.profiles(parent_comptable_id);

COMMENT ON COLUMN public.profiles.parent_comptable_id IS
  'Comptable dirigeant auquel ce collaborateur (role=comptable / comptable_dedie) est rattaché. NULL = comptable indépendant.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Accès par client pour chaque collaborateur
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cabinet_collaborateurs_acces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborateur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL DEFAULT 'both'
                  CHECK (scope IN ('compta','rh','both')),
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collaborateur_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_cabinet_acces_collab
  ON public.cabinet_collaborateurs_acces(collaborateur_id);
CREATE INDEX IF NOT EXISTS idx_cabinet_acces_societe
  ON public.cabinet_collaborateurs_acces(societe_id);

ALTER TABLE public.cabinet_collaborateurs_acces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cabinet_acces_select" ON public.cabinet_collaborateurs_acces;
CREATE POLICY "cabinet_acces_select" ON public.cabinet_collaborateurs_acces
  FOR SELECT USING (
    -- Le comptable dirigeant voit tous les accès qu'il a accordés
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = collaborateur_id AND p.parent_comptable_id = auth.uid()
    )
    OR
    -- Le collaborateur voit ses propres accès
    collaborateur_id = auth.uid()
    OR
    -- Admin global
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "cabinet_acces_modify" ON public.cabinet_collaborateurs_acces;
CREATE POLICY "cabinet_acces_modify" ON public.cabinet_collaborateurs_acces
  FOR ALL USING (
    -- Seul le comptable dirigeant peut modifier les accès de ses collaborateurs
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = collaborateur_id AND p.parent_comptable_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. Notes internes cabinet par client (non visibles du client final)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cabinet_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  comptable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contenu      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'note'
               CHECK (type IN ('note','todo','rappel','attention')),
  pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cabinet_notes_societe_comptable
  ON public.cabinet_notes(societe_id, comptable_id, pinned DESC, created_at DESC);

ALTER TABLE public.cabinet_notes ENABLE ROW LEVEL SECURITY;

-- Visibilité : comptable dirigeant + ses collaborateurs ayant accès au client
DROP POLICY IF EXISTS "cabinet_notes_select" ON public.cabinet_notes;
CREATE POLICY "cabinet_notes_select" ON public.cabinet_notes
  FOR SELECT USING (
    comptable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.parent_comptable_id = comptable_id
    )
    OR EXISTS (
      SELECT 1 FROM public.cabinet_collaborateurs_acces a
      WHERE a.collaborateur_id = auth.uid() AND a.societe_id = cabinet_notes.societe_id
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "cabinet_notes_modify" ON public.cabinet_notes;
CREATE POLICY "cabinet_notes_modify" ON public.cabinet_notes
  FOR ALL USING (
    comptable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.parent_comptable_id = comptable_id
    )
    OR EXISTS (
      SELECT 1 FROM public.cabinet_collaborateurs_acces a
      WHERE a.collaborateur_id = auth.uid() AND a.societe_id = cabinet_notes.societe_id
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. Tags cabinet (personnalisables par chaque dirigeant)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cabinet_tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comptable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  libelle      TEXT NOT NULL,
  couleur      TEXT NOT NULL DEFAULT '#0B0F2E',  -- hex
  icone        TEXT,                              -- nom lucide-react optionnel
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comptable_id, libelle)
);

CREATE INDEX IF NOT EXISTS idx_cabinet_tags_comptable
  ON public.cabinet_tags(comptable_id);

ALTER TABLE public.cabinet_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cabinet_tags_select" ON public.cabinet_tags;
CREATE POLICY "cabinet_tags_select" ON public.cabinet_tags
  FOR SELECT USING (
    comptable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.parent_comptable_id = comptable_id
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "cabinet_tags_modify" ON public.cabinet_tags;
CREATE POLICY "cabinet_tags_modify" ON public.cabinet_tags
  FOR ALL USING (
    comptable_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 5. Assignation tag → client
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cabinet_tag_assignments (
  tag_id     UUID NOT NULL REFERENCES public.cabinet_tags(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tag_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_cabinet_tag_assign_societe
  ON public.cabinet_tag_assignments(societe_id);

ALTER TABLE public.cabinet_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cabinet_tag_assign_select" ON public.cabinet_tag_assignments;
CREATE POLICY "cabinet_tag_assign_select" ON public.cabinet_tag_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cabinet_tags t
      WHERE t.id = tag_id AND (
        t.comptable_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.parent_comptable_id = t.comptable_id)
      )
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "cabinet_tag_assign_modify" ON public.cabinet_tag_assignments;
CREATE POLICY "cabinet_tag_assign_modify" ON public.cabinet_tag_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.cabinet_tags t
      WHERE t.id = tag_id AND (
        t.comptable_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.parent_comptable_id = t.comptable_id)
      )
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. Trigger : updated_at sur cabinet_notes et acces
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_cabinet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cabinet_notes_updated ON public.cabinet_notes;
CREATE TRIGGER trg_cabinet_notes_updated
  BEFORE UPDATE ON public.cabinet_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_cabinet_updated_at();

DROP TRIGGER IF EXISTS trg_cabinet_acces_updated ON public.cabinet_collaborateurs_acces;
CREATE TRIGGER trg_cabinet_acces_updated
  BEFORE UPDATE ON public.cabinet_collaborateurs_acces
  FOR EACH ROW EXECUTE FUNCTION public.set_cabinet_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
