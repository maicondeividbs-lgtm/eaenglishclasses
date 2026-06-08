-- Tabela que guarda as inscrições de push de cada usuário (1 por aparelho/navegador).
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid references public.profiles(id) on delete cascade,
  role         text,
  subscription jsonb not null,
  created_at   timestamptz default now()
);
create index if not exists idx_push_user on public.push_subscriptions(user_id);
create index if not exists idx_push_role on public.push_subscriptions(role);

-- RLS: cada usuário gerencia apenas as próprias inscrições.
alter table public.push_subscriptions enable row level security;

create policy "push_own_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_own_upsert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_own_update" on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push_own_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
-- A função serverless usa a SERVICE ROLE KEY, que ignora o RLS para enviar os pushes.
