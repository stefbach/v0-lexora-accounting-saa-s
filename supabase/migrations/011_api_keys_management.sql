-- API Keys for MCP Server authentication
-- Stores hashed API keys for external integrations (Claude, n8n, etc)

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  societe_id uuid references public.societes(id) on delete cascade,
  name text not null,
  description text,
  key_hash text not null unique, -- sha256 hash of the actual key
  key_preview text not null, -- first 8 chars visible for UI (e.g., "sk_live_abc...")
  created_at timestamp with time zone default now(),
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean default true,
  scopes text[] default '{"read:all","write:entries"}', -- granular permissions
  ip_whitelist text[], -- optional IP restrictions

  constraint api_keys_societe_or_global check (
    (societe_id is not null) or (societe_id is null)
  ),
  constraint api_keys_name_length check (char_length(name) >= 3 and char_length(name) <= 100)
);

-- Index for fast lookups
create index idx_api_keys_user_id on api_keys(user_id);
create index idx_api_keys_key_hash on api_keys(key_hash);
create index idx_api_keys_societe_id on api_keys(societe_id);
create index idx_api_keys_active on api_keys(is_active) where is_active = true;

-- Audit log for API key usage
create table if not exists api_keys_audit (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references api_keys(id) on delete cascade,
  action text not null, -- 'created', 'used', 'rotated', 'revoked'
  endpoint text,
  method text, -- 'GET', 'POST', 'PUT', 'DELETE'
  status_code integer,
  error_message text,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone default now()
);

create index idx_api_keys_audit_key_id on api_keys_audit(api_key_id);
create index idx_api_keys_audit_created_at on api_keys_audit(created_at desc);

-- RLS Policies
alter table api_keys enable row level security;
alter table api_keys_audit enable row level security;

-- Users can only see their own API keys
create policy "Users can read own API keys"
  on api_keys for select
  using (auth.uid() = user_id);

create policy "Users can create own API keys"
  on api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own API keys"
  on api_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete own API keys"
  on api_keys for delete
  using (auth.uid() = user_id);

-- Audit logs visible to key owner
create policy "Users can read audit logs of own keys"
  on api_keys_audit for select
  using (
    api_key_id in (
      select id from api_keys where user_id = auth.uid()
    )
  );

-- Service role can validate keys (for middleware)
create policy "Service role can read all keys"
  on api_keys for select
  using (auth.role() = 'service_role');

-- Function to generate a secure API key
create or replace function generate_api_key()
returns text as $$
declare
  key text;
begin
  -- Generate: sk_live_<32 random chars>
  key := 'sk_live_' || encode(gen_random_bytes(24), 'hex');
  return key;
end;
$$ language plpgsql security definer;

-- Function to hash API keys
create or replace function hash_api_key(key text)
returns text as $$
begin
  return encode(digest(key, 'sha256'), 'hex');
end;
$$ language plpgsql immutable;

-- Function to get key preview
create or replace function get_api_key_preview(key text)
returns text as $$
begin
  return substring(key, 1, 8) || '...' || substring(key from length(key) - 3);
end;
$$ language plpgsql immutable;

-- Function to update last_used_at
create or replace function update_api_key_last_used(key_hash_input text)
returns void as $$
begin
  update api_keys
  set last_used_at = now()
  where key_hash = key_hash_input and is_active = true;
end;
$$ language plpgsql security definer;
