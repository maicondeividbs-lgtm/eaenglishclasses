-- ═══════════════════════════════════════════════════════════════
-- PROFESSOR — ver acessos dos PRÓPRIOS alunos + marcar homework como feito
-- EA English Classes
--
-- Tudo aqui é ADITIVO e IDEMPOTENTE (seguro rodar mais de uma vez).
-- NÃO remove nem altera nenhuma política existente de aluno/coordenação.
--
-- O que este script faz:
--   1) Helpers SECURITY DEFINER (não causam recursão de RLS).
--   2) access_logs: o professor passa a LER somente os acessos dos seus
--      alunos vinculados (matrícula ativa) e apenas registros de papel
--      'student'. Continua SEM ver acessos de outros alunos e de
--      professores/coordenação.
--   3) task_submissions: o professor pode marcar como entregue
--      ('submitted') as tarefas que ELE mesmo criou — para o caso de o
--      aluno esquecer de marcar. Não toca na política do aluno.
--
-- Rode no Supabase → SQL Editor. Depois publique o site (sw já em ea-v13).
-- ═══════════════════════════════════════════════════════════════


-- ── 1) HELPERS ────────────────────────────────────────────────────
-- TRUE se o aluno informado está vinculado (matrícula ativa) ao
-- professor autenticado. SECURITY DEFINER para ignorar a RLS de
-- enrollments e NÃO recursar.
create or replace function public.teaches_student(p_student uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.teacher_id = auth.uid()
      and e.student_id = p_student
      and coalesce(e.active, true) = true
  );
$$;

-- TRUE se a tarefa informada pertence (teacher_id) ao professor autenticado.
-- OBS.: tasks.id é inteiro nesta base; usamos bigint para cobrir serial e
-- bigserial sem erro de tipo.
create or replace function public.owns_task(p_task bigint)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task
      and t.teacher_id = auth.uid()
  );
$$;

-- Apenas usuários autenticados podem executar os helpers.
revoke all on function public.teaches_student(uuid) from public;
grant execute on function public.teaches_student(uuid) to authenticated;
revoke all on function public.owns_task(bigint) from public;
grant execute on function public.owns_task(bigint) to authenticated;


-- ── 2) ACCESS_LOGS ────────────────────────────────────────────────
-- Garante a RLS ligada (é ela que impede o vazamento). Idempotente:
-- se já estiver ligada, não faz nada.
alter table public.access_logs enable row level security;

-- (a) Cada usuário registra o PRÓPRIO acesso — mantém o login funcionando.
drop policy if exists "access_logs self insert (prof feature)" on public.access_logs;
create policy "access_logs self insert (prof feature)" on public.access_logs
  for insert
  with check (auth.uid() = user_id);

-- (b) Coordenação enxerga tudo — garante que o painel da coordenação
--     continue funcionando mesmo após confirmar a RLS.
drop policy if exists "access_logs coordinator read (prof feature)" on public.access_logs;
create policy "access_logs coordinator read (prof feature)" on public.access_logs
  for select
  using (is_coordinator());

-- (c) PROFESSOR: lê SOMENTE os acessos dos seus alunos vinculados, e
--     apenas registros de papel 'student'. Dupla trava (role + vínculo)
--     evita qualquer vazamento de acessos de outros alunos/professores.
drop policy if exists "access_logs teacher read own students" on public.access_logs;
create policy "access_logs teacher read own students" on public.access_logs
  for select
  using (
    role = 'student'
    and public.teaches_student(user_id)
  );


-- ── 3) TASK_SUBMISSIONS ───────────────────────────────────────────
-- Professor pode atualizar (marcar como entregue) as entregas das
-- tarefas que ELE criou. Apenas ADICIONA uma política de UPDATE;
-- a política do aluno (atualizar a própria entrega) permanece intacta.
drop policy if exists "task_submissions teacher mark own" on public.task_submissions;
create policy "task_submissions teacher mark own" on public.task_submissions
  for update
  using ( public.owns_task(task_id) )
  with check ( public.owns_task(task_id) );


-- Pronto. Nada além disto precisa mudar no Supabase para estas features.
