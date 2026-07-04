-- ═══════════════════════════════════════════════════════════════
-- PLANOS DE AULA — EA English Classes
-- Preparação de aulas por ALUNO e por MÊS (estrutura da "Preparação de aulas").
--   • lesson_plans          → cabeçalho (1 por professor + aluno + mês): Livro, Nível, Observações
--   • lesson_plan_entries   → linhas da grade: Data, Tópico, Páginas, Homework, Last homework
-- Visível para o próprio professor e para a COORDENAÇÃO (supervisão). Aluno não acessa.
-- Rode no Supabase → SQL Editor. É seguro rodar mais de uma vez (idempotente/aditivo).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) CABEÇALHO DO PLANO
--    Os nomes dos FKs (lesson_plans_teacher_id_fkey / _student_id_fkey)
--    são gerados automaticamente pelo Postgres e são EXATAMENTE os que
--    o supabase.js usa nos selects embutidos. Não renomeie.
--    plan_month guarda SEMPRE o dia 1 do mês (ex.: 2025-07-01).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.lesson_plans (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  plan_month  date not null,                 -- sempre YYYY-MM-01
  book        text,                          -- ex.: "Interchange 2" (auto da matrícula, editável)
  level       text,                          -- ex.: "A2"            (auto da matrícula, editável)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (teacher_id, student_id, plan_month)
);

-- Colunas (caso a tabela já existisse sem alguma delas — seguro rodar).
alter table public.lesson_plans add column if not exists book       text;
alter table public.lesson_plans add column if not exists level      text;
alter table public.lesson_plans add column if not exists notes      text;
alter table public.lesson_plans add column if not exists created_at timestamptz not null default now();
alter table public.lesson_plans add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_lp_teacher on public.lesson_plans(teacher_id);
create index if not exists idx_lp_student on public.lesson_plans(student_id);
create index if not exists idx_lp_month   on public.lesson_plans(plan_month);

-- ─────────────────────────────────────────────────────────────
-- 2) LINHAS DA GRADE
--    Uma linha por aula planejada. Ordem: lesson_date, depois sort_order.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.lesson_plan_entries (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.lesson_plans(id) on delete cascade,
  lesson_date   date,                          -- DATA
  topic         text,                          -- TÓPICO
  objective     text,                          -- OBJETIVO (da aula)
  pages         text,                          -- PÁGINAS (PREVISÃO) — estimativa, pode mudar
  homework      text,                          -- HOMEWORK (só planejamento — texto livre)
  last_homework text,                          -- LAST HOMEWORK (texto livre)
  notes         text,                          -- OBSERVAÇÕES (da aula)
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.lesson_plan_entries add column if not exists lesson_date   date;
alter table public.lesson_plan_entries add column if not exists topic         text;
alter table public.lesson_plan_entries add column if not exists objective     text;
alter table public.lesson_plan_entries add column if not exists pages         text;
alter table public.lesson_plan_entries add column if not exists homework      text;
alter table public.lesson_plan_entries add column if not exists last_homework text;
alter table public.lesson_plan_entries add column if not exists notes         text;
alter table public.lesson_plan_entries add column if not exists sort_order    int not null default 0;
alter table public.lesson_plan_entries add column if not exists created_at    timestamptz not null default now();
alter table public.lesson_plan_entries add column if not exists updated_at    timestamptz not null default now();

create index if not exists idx_lpe_plan on public.lesson_plan_entries(plan_id);
create index if not exists idx_lpe_date on public.lesson_plan_entries(lesson_date);

-- ─────────────────────────────────────────────────────────────
-- 3) RLS — segurança por papel
--    Professor: CRUD apenas nos PRÓPRIOS planos (auth.uid() = teacher_id).
--    Coordenação: enxerga (e pode ajustar) TODOS os planos, via is_coordinator().
--    Aluno / não autenticado: sem acesso (não há policy → deny por padrão).
--    is_coordinator() já existe no projeto (SECURITY DEFINER) — não recriar aqui.
-- ─────────────────────────────────────────────────────────────
alter table public.lesson_plans        enable row level security;
alter table public.lesson_plan_entries enable row level security;

-- ── lesson_plans ──
drop policy if exists "lp select own or coord"  on public.lesson_plans;
create policy "lp select own or coord" on public.lesson_plans
  for select using (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "lp insert own or coord"  on public.lesson_plans;
create policy "lp insert own or coord" on public.lesson_plans
  for insert with check (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "lp update own or coord"  on public.lesson_plans;
create policy "lp update own or coord" on public.lesson_plans
  for update using (auth.uid() = teacher_id or is_coordinator())
  with check   (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "lp delete own or coord"  on public.lesson_plans;
create policy "lp delete own or coord" on public.lesson_plans
  for delete using (auth.uid() = teacher_id or is_coordinator());

-- ── lesson_plan_entries ──
-- Acesso amarrado ao dono do plano-pai (via EXISTS no cabeçalho).
drop policy if exists "lpe select via plan" on public.lesson_plan_entries;
create policy "lpe select via plan" on public.lesson_plan_entries
  for select using (
    exists (
      select 1 from public.lesson_plans p
      where p.id = lesson_plan_entries.plan_id
        and (p.teacher_id = auth.uid() or is_coordinator())
    )
  );

drop policy if exists "lpe insert via plan" on public.lesson_plan_entries;
create policy "lpe insert via plan" on public.lesson_plan_entries
  for insert with check (
    exists (
      select 1 from public.lesson_plans p
      where p.id = lesson_plan_entries.plan_id
        and (p.teacher_id = auth.uid() or is_coordinator())
    )
  );

drop policy if exists "lpe update via plan" on public.lesson_plan_entries;
create policy "lpe update via plan" on public.lesson_plan_entries
  for update using (
    exists (
      select 1 from public.lesson_plans p
      where p.id = lesson_plan_entries.plan_id
        and (p.teacher_id = auth.uid() or is_coordinator())
    )
  );

drop policy if exists "lpe delete via plan" on public.lesson_plan_entries;
create policy "lpe delete via plan" on public.lesson_plan_entries
  for delete using (
    exists (
      select 1 from public.lesson_plans p
      where p.id = lesson_plan_entries.plan_id
        and (p.teacher_id = auth.uid() or is_coordinator())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4) updated_at automático (opcional, mas mantém consistência)
-- ─────────────────────────────────────────────────────────────
create or replace function public.lp_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_lp_touch   on public.lesson_plans;
create trigger trg_lp_touch  before update on public.lesson_plans
  for each row execute function public.lp_touch_updated_at();

drop trigger if exists trg_lpe_touch  on public.lesson_plan_entries;
create trigger trg_lpe_touch before update on public.lesson_plan_entries
  for each row execute function public.lp_touch_updated_at();

-- Pronto. Nenhum webhook/notificação é necessário — planos de aula são
-- documentos internos (professor + coordenação), sem push/e-mail.
