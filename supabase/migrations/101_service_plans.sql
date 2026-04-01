-- Service plans table
CREATE TABLE IF NOT EXISTS public.service_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 'premium', 'comptabilite', 'rh_paie', 'compta_rh'
  nom TEXT NOT NULL,
  description TEXT,
  modules JSONB NOT NULL DEFAULT '{}', -- {"comptabilite": true, "rh": true, "juridique": true, "facturation": true}
  prix_mensuel NUMERIC(10,2) DEFAULT 0,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO public.service_plans (code, nom, description, modules, prix_mensuel) VALUES
('premium', 'Premium', 'Acces complet: Comptabilite + RH + Juridique + Facturation', '{"comptabilite":true,"rh":true,"juridique":true,"facturation":true,"documents":true}', 0),
('comptabilite', 'Comptabilite', 'Module comptabilite uniquement', '{"comptabilite":true,"rh":false,"juridique":false,"facturation":true,"documents":true}', 0),
('rh_paie', 'RH & Paie', 'Module RH et paie uniquement', '{"comptabilite":false,"rh":true,"juridique":false,"facturation":false,"documents":true}', 0),
('compta_rh', 'Compta + RH', 'Comptabilite et RH', '{"comptabilite":true,"rh":true,"juridique":false,"facturation":true,"documents":true}', 0)
ON CONFLICT (code) DO NOTHING;

-- Link societes to plans
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.service_plans(id);
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS plan_code TEXT DEFAULT 'premium';
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS modules_actifs JSONB DEFAULT '{"comptabilite":true,"rh":true,"juridique":true,"facturation":true,"documents":true}';

ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_auth" ON public.service_plans FOR ALL USING (auth.uid() IS NOT NULL);
