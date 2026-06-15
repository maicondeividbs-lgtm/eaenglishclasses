-- ═══════════════════════════════════════════════════════════════
-- PERGUNTAS DOS ALUNOS — EA English Classes  (tabela: help_requests)
-- Aluno envia uma pergunta ao professor; o professor responde.
-- Dispara notificação (push) + e-mail nos dois sentidos.
-- Rode no Supabase → SQL Editor. É seguro rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

-- 1) Tabela (cria só se não existir).
--    Os nomes dos FKs (help_requests_student_id_fkey / _teacher_id_fkey)
--    são gerados automaticamente pelo Postgres e são EXATAMENTE os que
--    o supabase.js usa nos selects embutidos. Não renomeie.
create table if not exists public.help_requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  teacher_id  uuid          references public.profiles(id) on delete set null,
  subject     text,
  message     text not null,
  answer      text,
  status      text not null default 'open',   -- 'open' → 'answered'
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  read_at     timestamptz
);

-- 2) Colunas (caso a tabela já existisse sem alguma delas — seguro rodar).
alter table public.help_requests add column if not exists subject     text;
alter table public.help_requests add column if not exists answer      text;
alter table public.help_requests add column if not exists status      text not null default 'open';
alter table public.help_requests add column if not exists answered_at timestamptz;
alter table public.help_requests add column if not exists read_at     timestamptz;
alter table public.help_requests add column if not exists created_at  timestamptz not null default now();

-- 3) Índices (consultas filtram por aluno, por professor e por status).
create index if not exists idx_help_student on public.help_requests(student_id);
create index if not exists idx_help_teacher on public.help_requests(teacher_id);
create index if not exists idx_help_status  on public.help_requests(status);

-- 4) RLS — segurança por papel.
alter table public.help_requests enable row level security;

-- Aluno: cria, lê e atualiza (marcar como lido) somente as PRÓPRIAS perguntas.
drop policy if exists "student insert own help" on public.help_requests;
create policy "student insert own help" on public.help_requests
  for insert with check (auth.uid() = student_id);

drop policy if exists "student read own help" on public.help_requests;
create policy "student read own help" on public.help_requests
  for select using (auth.uid() = student_id);

drop policy if exists "student update own help" on public.help_requests;
create policy "student update own help" on public.help_requests
  for update using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- Professor/Coordenação: leem e respondem as perguntas destinadas a si
-- (a coordenação enxerga todas, via is_coordinator()).
drop policy if exists "staff read help" on public.help_requests;
create policy "staff read help" on public.help_requests
  for select using (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "staff answer help" on public.help_requests;
create policy "staff answer help" on public.help_requests
  for update using (auth.uid() = teacher_id or is_coordinator())
  with check (auth.uid() = teacher_id or is_coordinator());

-- 5) Realtime (necessário para o SINO atualizar em tempo real).
--    Ignore o aviso caso a tabela já esteja na publicação.
do $$
begin
  alter publication supabase_realtime add table public.help_requests;
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- Pronto. Depois de rodar este SQL, configure os Database Webhooks
-- (veja CONFIG-perguntas.md) e publique o site atualizado.
