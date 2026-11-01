-- Smart Exam Paper Studio — initial schema
create extension if not exists vector;

-- Library items: learning resources, past papers and structure files
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('resource','past_paper','structure')),
  title text not null,
  description text not null default '',
  file_name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  storage_path text not null,
  subject text not null default '',
  module text not null default '',
  topic text not null default '',
  academic_year text not null default '',
  semester text not null default '',
  exam_type text not null default '',
  paper_year text not null default '',
  notes text not null default '',
  text_content text not null default '',
  char_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error text,
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_user_kind_idx on public.resources (user_id, kind, created_at desc);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index chunks_resource_idx on public.chunks (resource_id, idx);
create index chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);

create table public.structures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled examination',
  status text not null default 'draft' check (status in ('draft','generating','ready','failed')),
  config jsonb not null default '{}'::jsonb,       -- exam details + formatting + generation options
  structure jsonb,                                  -- paper structure used
  prompt text not null default '',
  resource_ids uuid[] not null default '{}',
  past_paper_ids uuid[] not null default '{}',
  content jsonb,                                    -- generated, editable paper
  marking_scheme jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index papers_user_idx on public.papers (user_id, updated_at desc);

-- Row level security
alter table public.resources enable row level security;
alter table public.chunks enable row level security;
alter table public.structures enable row level security;
alter table public.prompts enable row level security;
alter table public.user_settings enable row level security;
alter table public.papers enable row level security;

create policy "own resources" on public.resources for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chunks" on public.chunks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own structures" on public.structures for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own prompts" on public.prompts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own papers" on public.papers for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Semantic retrieval restricted to the caller's own chunks (SECURITY INVOKER => RLS applies)
create or replace function public.match_chunks(
  query_embedding vector(1536),
  resource_ids uuid[],
  match_count int default 12
)
returns table (id uuid, resource_id uuid, idx int, content text, similarity float)
language sql stable
as $$
  select c.id, c.resource_id, c.idx, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.resource_id = any(resource_ids)
    and c.user_id = auth.uid()
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Private storage bucket; objects live under "<user_id>/..."
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "own documents read" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents write" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents update" on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents delete" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
