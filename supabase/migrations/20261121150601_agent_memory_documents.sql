-- R3 POC local: durable memory + authorized documents (AGENT_MEMORY_R3).
-- Not applied to DEV/PROD. Flag stays off unless AGENT_MEMORY_R3=1.
begin;

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  area_id uuid null references public.areas (id) on delete set null,
  memory_type text not null check (memory_type in ('agreement', 'decision', 'preference', 'follow_up')),
  body text not null check (char_length(body) between 1 and 2048),
  source_kind text not null check (source_kind in ('session', 'document', 'manual')),
  source_ref text null check (source_ref is null or char_length(source_ref) <= 128),
  content_hash text not null check (char_length(content_hash) between 16 and 128),
  validation_status text not null check (
    validation_status in ('proposed', 'confirmed', 'rejected', 'superseded', 'deleted')
  ),
  access_level text not null check (access_level in ('owner', 'area', 'project_read')),
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid null references public.agent_memory (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz null,
  confirmed_by uuid null references public.usuarios (id) on delete set null,
  confirmed_at timestamptz null
);

create index if not exists agent_memory_owner_idx on public.agent_memory (usuario_id);
create index if not exists agent_memory_status_idx on public.agent_memory (validation_status)
  where validation_status = 'confirmed';
create index if not exists agent_memory_fts_idx on public.agent_memory
  using gin (to_tsvector('spanish', body));

alter table public.agent_memory enable row level security;
revoke all on public.agent_memory from anon, authenticated;
grant select, insert, update on public.agent_memory to authenticated;

drop policy if exists agent_memory_owner_rw on public.agent_memory;
create policy agent_memory_owner_rw on public.agent_memory
  for all to authenticated
  using (
    usuario_id = (select public.get_my_usuario_id())
    and (select public.okr_active_user())
  )
  with check (
    usuario_id = (select public.get_my_usuario_id())
    and (select public.okr_active_user())
  );

comment on table public.agent_memory is
  'R3 confirmed agreements/decisions/preferences. Live Kanban/OKR state is never stored here.';

create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  logical_id text not null check (char_length(logical_id) between 1 and 120),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 32768),
  version integer not null check (version >= 1),
  status text not null check (status in ('published', 'withdrawn')),
  access_level text not null check (access_level in ('owner', 'area', 'project_read')),
  area_id uuid null references public.areas (id) on delete set null,
  content_hash text not null check (char_length(content_hash) between 16 and 128),
  source_label text not null check (char_length(source_label) between 1 and 120),
  published_at timestamptz null,
  withdrawn_at timestamptz null,
  unique (logical_id, version)
);

create index if not exists agent_documents_published_idx on public.agent_documents (logical_id)
  where status = 'published';
create index if not exists agent_documents_fts_idx on public.agent_documents
  using gin (to_tsvector('spanish', coalesce(title, '') || ' ' || body));

alter table public.agent_documents enable row level security;
revoke all on public.agent_documents from anon, authenticated;
grant select on public.agent_documents to authenticated;

drop policy if exists agent_documents_read_published on public.agent_documents;
create policy agent_documents_read_published on public.agent_documents
  for select to authenticated
  using (
    status = 'published'
    and (select public.okr_active_user())
  );

comment on table public.agent_documents is
  'R3 authorized procedures/policies. Document metrics never override live OKR/Kanban values.';

commit;
