-- Manager peut être affecté à un groupe qu'il gère
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS groupe_gere_id UUID;
