-- FTS recall for published R3 documents using the existing Spanish GIN expression index.
begin;

create or replace function public.recall_agent_documents(q text)
returns setof public.agent_documents
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.agent_documents
  where status = 'published'
    and length(trim(coalesce(q, ''))) >= 2
    and to_tsvector('spanish', coalesce(title, '') || ' ' || body)
        @@ plainto_tsquery('spanish', q)
  order by ts_rank(
    to_tsvector('spanish', coalesce(title, '') || ' ' || body),
    plainto_tsquery('spanish', q)
  ) desc, published_at desc nulls last
  limit 8;
$$;

revoke all on function public.recall_agent_documents(text) from public, anon;
grant execute on function public.recall_agent_documents(text) to authenticated, service_role;

comment on function public.recall_agent_documents(text) is
  'R3 document recall via plainto_tsquery(spanish) over the existing GIN index.';

commit;
