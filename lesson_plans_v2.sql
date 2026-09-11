-- ═══════════════════════════════════════════════════════════════
-- PLANOS DE AULA — evolução v2 (EA English Classes)
--   1) lesson_plans.book_pages            → total de páginas do livro (completude do curso)
--   2) lesson_plan_entries.last_auto       → marca se o "Last homework" é automático
--   3) speaking_notes                      → observações de speaking por aluno/data
--
-- 100% ADITIVO e IDEMPOTENTE. Não apaga nem altera nada existente.
-- Rode no Supabase → SQL Editor. Pode rodar mais de uma vez.
-- Depende de is_coordinator() (já existe no projeto — não recriar aqui).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) TOTAL DE PÁGINAS DO LIVRO
--    Fica no cabeçalho do plano. O editor herda o último valor
--    informado para o mesmo aluno/livro, então basta ajustar uma vez.
-- ─────────────────────────────────────────────────────────────
alter table public.lesson_plans
  add column if not exists book_pages int;

-- ─────────────────────────────────────────────────────────────
-- 2) LAST HOMEWORK AUTOMÁTICO x MANUAL
--    true  → o campo é recalculado a partir dos homeworks realmente
--            enviados (tabela tasks) + data da aula.
--    false → o professor digitou à mão; nunca é sobrescrito.
--    Default true preserva o comportamento dos planos já salvos.
-- ─────────────────────────────────────────────────────────────
alter table public.lesson_plan_entries
  add column if not exists last_auto boolean not null default true;

-- ─────────────────────────────────────────────────────────────
-- 3) OBSERVAÇÕES DE SPEAKING
--    Um bloco de texto por professor + aluno + data (o mesmo formato
--    do bloco datado que o professor já escreve no bloco de notas).
--    Salvar de novo na mesma data substitui o bloco (upsert).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.speaking_notes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  note_date   date not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (teacher_id, student_id, note_date)
);

alter table public.speaking_notes add column if not exists content    text;
alter table public.speaking_notes add column if not exists created_at timestamptz not null default now();
alter table public.speaking_notes add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_sn_teacher on public.speaking_notes(teacher_id);
create index if not exists idx_sn_student on public.speaking_notes(student_id);
create index if not exists idx_sn_date    on public.speaking_notes(note_date);

-- ─────────────────────────────────────────────────────────────
-- 4) RLS — mesmo desenho dos planos de aula
--    Professor: CRUD só nas PRÓPRIAS observações.
--    Coordenação: enxerga e ajusta todas (supervisão), via is_coordinator().
--    Aluno / anônimo: sem policy → negado por padrão.
-- ─────────────────────────────────────────────────────────────
alter table public.speaking_notes enable row level security;

drop policy if exists "sn select own or coord" on public.speaking_notes;
create policy "sn select own or coord" on public.speaking_notes
  for select using (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "sn insert own or coord" on public.speaking_notes;
create policy "sn insert own or coord" on public.speaking_notes
  for insert with check (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "sn update own or coord" on public.speaking_notes;
create policy "sn update own or coord" on public.speaking_notes
  for update using (auth.uid() = teacher_id or is_coordinator())
  with check   (auth.uid() = teacher_id or is_coordinator());

drop policy if exists "sn delete own or coord" on public.speaking_notes;
create policy "sn delete own or coord" on public.speaking_notes
  for delete using (auth.uid() = teacher_id or is_coordinator());

-- ─────────────────────────────────────────────────────────────
-- 5) updated_at automático (reusa a função já criada em lesson_plans.sql)
-- ─────────────────────────────────────────────────────────────
create or replace function public.lp_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_sn_touch on public.speaking_notes;
create trigger trg_sn_touch before update on public.speaking_notes
  for each row execute function public.lp_touch_updated_at();

-- Sem webhook/notificação: observações de speaking são documento interno
-- (professor + coordenação). O aluno não acessa.

-- Recarrega o schema cache do PostgREST para as colunas novas valerem já.
notify pgrst, 'reload schema';
