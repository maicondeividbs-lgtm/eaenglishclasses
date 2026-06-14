-- ═══════════════════════════════════════════════════════════════
-- CANCELAMENTO DE ENVIOS — EA English Classes
-- Marca Homework / Feedback / Aviso como "cancelado".
-- O destinatário (aluno) deixa de ver; o registro permanece para
-- auditoria e pode ser revertido (cancelled = false).
-- Rode no Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- 1) Colunas (seguro rodar mais de uma vez)
alter table public.tasks         add column if not exists cancelled boolean not null default false;
alter table public.tasks         add column if not exists cancelled_at timestamptz;
alter table public.feedbacks     add column if not exists cancelled boolean not null default false;
alter table public.feedbacks     add column if not exists cancelled_at timestamptz;
alter table public.announcements add column if not exists cancelled boolean not null default false;
alter table public.announcements add column if not exists cancelled_at timestamptz;

-- 2) Índices (as consultas do aluno filtram cancelled = false)
create index if not exists idx_tasks_cancelled         on public.tasks(cancelled);
create index if not exists idx_feedbacks_cancelled      on public.feedbacks(cancelled);
create index if not exists idx_announcements_cancelled  on public.announcements(cancelled);

-- ───────────────────────────────────────────────────────────────
-- 3) (OPCIONAL) Políticas de UPDATE.
-- Rode esta parte SOMENTE se, ao clicar em "Cancelar" no painel,
-- aparecer erro de permissão (RLS). Se já existir uma policy de
-- UPDATE que permite o dono editar suas linhas, o cancelamento já
-- funciona e você NÃO precisa do bloco abaixo.
--
-- Estas políticas são permissivas (somam-se às existentes) e
-- liberam o autor (ou a coordenação) a atualizar suas próprias linhas.
-- ───────────────────────────────────────────────────────────────

-- HOMEWORK (tabela tasks: dono = teacher_id)
-- drop policy if exists "owner cancel tasks" on public.tasks;
-- create policy "owner cancel tasks" on public.tasks
--   for update using (auth.uid() = teacher_id or is_coordinator())
--   with check (auth.uid() = teacher_id or is_coordinator());

-- FEEDBACK (tabela feedbacks: dono = teacher_id)
-- drop policy if exists "owner cancel feedbacks" on public.feedbacks;
-- create policy "owner cancel feedbacks" on public.feedbacks
--   for update using (auth.uid() = teacher_id or is_coordinator())
--   with check (auth.uid() = teacher_id or is_coordinator());

-- AVISO (tabela announcements: dono = author_id)
-- drop policy if exists "owner cancel announcements" on public.announcements;
-- create policy "owner cancel announcements" on public.announcements
--   for update using (auth.uid() = author_id or is_coordinator())
--   with check (auth.uid() = author_id or is_coordinator());

-- Pronto. Depois de rodar, publique o site atualizado.
