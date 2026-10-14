-- ═══════════════════════════════════════════════════════════════
-- MENU — CONTADORES DE ITENS NÃO ABERTOS (WIN)
--
--   1) seen_at em cada tabela que o aluno recebe
--      → quando o aluno abre a seção, os itens ganham data de visualização
--   2) win_settings.seen_tracking_since
--      → data em que a contagem começou. Itens mais antigos não entram no
--        contador (evita "Vocabulário 47" no primeiro acesso) e o professor
--        não vê "Não aberto" em envios de antes da mudança.
--   3) win_unseen_counts()  → contagem do aluno logado, numa chamada só
--   4) win_mark_seen(kind)  → marca como vistos os itens de uma seção
--
-- 100% ADITIVO e IDEMPOTENTE. Não apaga nem altera nada existente
-- e não mexe em nenhuma policy de RLS: as duas funções rodam como
-- SECURITY DEFINER e só tocam nas linhas do próprio aluno (auth.uid()).
--
-- ORDEM: publique o site (inclui a proteção em api/send-push.js e
-- api/send-email.js) e SÓ DEPOIS rode este arquivo no Supabase → SQL Editor.
-- Pode rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

-- 1) COLUNAS ───────────────────────────────────────────────────
alter table public.task_submissions   add column if not exists seen_at timestamptz;
alter table public.writing_activities add column if not exists seen_at timestamptz;
alter table public.feedbacks          add column if not exists seen_at timestamptz;
alter table public.vocabulary_words   add column if not exists seen_at timestamptz;
alter table public.pronunciation      add column if not exists seen_at timestamptz;
alter table public.assessment_grades  add column if not exists seen_at timestamptz;

-- Índices parciais: a contagem só olha itens ainda não vistos
create index if not exists idx_ts_unseen  on public.task_submissions(student_id)   where seen_at is null;
create index if not exists idx_wa_unseen  on public.writing_activities(student_id) where seen_at is null;
create index if not exists idx_fb_unseen  on public.feedbacks(student_id)          where seen_at is null;
create index if not exists idx_vw_unseen  on public.vocabulary_words(student_id)   where seen_at is null;
create index if not exists idx_pr_unseen  on public.pronunciation(student_id)      where seen_at is null;
create index if not exists idx_ag_unseen  on public.assessment_grades(student_id)  where seen_at is null;

-- 2) INÍCIO DA CONTAGEM ────────────────────────────────────────
create table if not exists public.win_settings (
  key   text primary key,
  value timestamptz not null
);
insert into public.win_settings (key, value)
values ('seen_tracking_since', now())
on conflict (key) do nothing;   -- rodar de novo NÃO move a data

alter table public.win_settings enable row level security;
drop policy if exists "win_settings read" on public.win_settings;
create policy "win_settings read" on public.win_settings
  for select to authenticated using (true);

-- 3) CONTAGEM DO ALUNO ─────────────────────────────────────────
create or replace function public.win_unseen_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce(
      (select value from public.win_settings where key = 'seen_tracking_since'),
      now()
    ) as since
  )
  select json_build_object(
    'homework', (
      select count(*) from public.task_submissions ts
      join public.tasks t on t.id = ts.task_id, s
      where ts.student_id = auth.uid() and ts.seen_at is null
        and ts.created_at >= s.since and not coalesce(t.cancelled, false)),
    'writing', (
      select count(*) from public.writing_activities w, s
      where w.student_id = auth.uid() and w.seen_at is null and w.created_at >= s.since),
    'feedback', (
      select count(*) from public.feedbacks f, s
      where f.student_id = auth.uid() and f.seen_at is null
        and f.created_at >= s.since and not coalesce(f.cancelled, false)),
    'vocabulary', (
      select count(*) from public.vocabulary_words v, s
      where v.student_id = auth.uid() and v.seen_at is null and v.created_at >= s.since),
    'pronunciation', (
      select count(*) from public.pronunciation p, s
      where p.student_id = auth.uid() and p.seen_at is null and p.created_at >= s.since),
    'grades', (
      select count(*) from public.assessment_grades g, s
      where g.student_id = auth.uid() and g.seen_at is null and g.created_at >= s.since)
  );
$$;

revoke all on function public.win_unseen_counts() from public;
grant execute on function public.win_unseen_counts() to authenticated;

-- 4) MARCAR COMO VISTO ─────────────────────────────────────────
create or replace function public.win_mark_seen(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  if    p_kind = 'homework'      then update public.task_submissions   set seen_at = now() where student_id = uid and seen_at is null;
  elsif p_kind = 'writing'       then update public.writing_activities set seen_at = now() where student_id = uid and seen_at is null;
  elsif p_kind = 'feedback'      then update public.feedbacks          set seen_at = now() where student_id = uid and seen_at is null;
  elsif p_kind = 'vocabulary'    then update public.vocabulary_words   set seen_at = now() where student_id = uid and seen_at is null;
  elsif p_kind = 'pronunciation' then update public.pronunciation      set seen_at = now() where student_id = uid and seen_at is null;
  elsif p_kind = 'grades'        then update public.assessment_grades  set seen_at = now() where student_id = uid and seen_at is null;
  end if;
end;
$$;

revoke all on function public.win_mark_seen(text) from public;
grant execute on function public.win_mark_seen(text) to authenticated;

-- Pronto.
