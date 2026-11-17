-- Sesiones ligeras QUERY vs TASK_UPDATE (no mezclar historial Gemini con estado OPS).
create table if not exists public.whatsapp_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  usuario_id uuid references public.usuarios (id) on delete set null,
  flow_type text not null check (flow_type in ('chatbot_query', 'task_update')),
  status text not null default 'active'
    check (status in ('active', 'awaiting_clarification', 'closed', 'cancelled', 'expired')),
  current_entity_id text,
  correlation_id text,
  related_task_id text,
  intent text,
  meta jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_flow_sessions_phone_active_idx
  on public.whatsapp_flow_sessions (phone, status)
  where status in ('active', 'awaiting_clarification');

create index if not exists whatsapp_flow_sessions_usuario_active_idx
  on public.whatsapp_flow_sessions (usuario_id, status)
  where status in ('active', 'awaiting_clarification');

create index if not exists whatsapp_flow_sessions_expires_idx
  on public.whatsapp_flow_sessions (expires_at);

alter table public.whatsapp_flow_sessions enable row level security;

-- Solo service_role / edge (sin policies de cliente).
comment on table public.whatsapp_flow_sessions is
  'Sesiones WhatsApp separadas: chatbot_query vs task_update. Usada por webhook Edge/Vercel.';
