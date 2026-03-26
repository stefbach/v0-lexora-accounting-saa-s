-- Contact form messages table
CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  entreprise TEXT,
  telephone TEXT,
  message TEXT NOT NULL,
  lu BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS needed — only service role inserts (from API route)
-- Admin can read from Supabase dashboard
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact messages"
  ON public.contact_messages FOR ALL
  USING (
    public.get_my_role() = 'admin'
  );
