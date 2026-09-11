-- ═══════════════════════════════════════════════════════════════
-- ATIVIDADES DE MÚSICA — EA English Classes
--   Coordenação envia duas versões (professor e aluno) em Word.
--   Professores baixam pela Biblioteca.
--
-- 100% ADITIVO e IDEMPOTENTE. Pode rodar mais de uma vez.
-- Rode no Supabase → SQL Editor.
-- Depende de is_coordinator(), que já existe no projeto.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) CATÁLOGO
--    Catálogo único, sem hierarquia de nível: o nível é etiqueta,
--    não eixo de organização.
--    Exclusão é lógica (active = false), no mesmo padrão de
--    "marcar como cancelado" adotado nos agendamentos.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.music_activities (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,          -- nome da música
  artist         text,                   -- artista
  level          text,                   -- etiqueta de nível (livre)
  grammar_focus  text,                   -- foco gramatical
  teacher_path   text,                   -- caminho no bucket, versão do professor
  teacher_name   text,                   -- nome original do arquivo
  student_path   text,                   -- caminho no bucket, versão do aluno
  student_name   text,
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.music_activities add column if not exists artist        text;
alter table public.music_activities add column if not exists level         text;
alter table public.music_activities add column if not exists grammar_focus text;
alter table public.music_activities add column if not exists teacher_path  text;
alter table public.music_activities add column if not exists teacher_name  text;
alter table public.music_activities add column if not exists student_path  text;
alter table public.music_activities add column if not exists student_name  text;
alter table public.music_activities add column if not exists active        boolean not null default true;

create index if not exists idx_music_active  on public.music_activities(active);
create index if not exists idx_music_created on public.music_activities(created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2) RLS
--    Leitura pública (a Biblioteca é uma página aberta, mesmo
--    tratamento já dado aos worksheets).
--    Escrita apenas para a coordenação.
-- ─────────────────────────────────────────────────────────────
alter table public.music_activities enable row level security;

drop policy if exists "music select public" on public.music_activities;
create policy "music select public" on public.music_activities
  for select using (active = true);

drop policy if exists "music insert coord" on public.music_activities;
create policy "music insert coord" on public.music_activities
  for insert with check (is_coordinator());

drop policy if exists "music update coord" on public.music_activities;
create policy "music update coord" on public.music_activities
  for update using (is_coordinator()) with check (is_coordinator());

drop policy if exists "music delete coord" on public.music_activities;
create policy "music delete coord" on public.music_activities
  for delete using (is_coordinator());

-- ─────────────────────────────────────────────────────────────
-- 3) updated_at automático (reusa a função já criada em lesson_plans.sql)
-- ─────────────────────────────────────────────────────────────
create or replace function public.lp_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_music_touch on public.music_activities;
create trigger trg_music_touch before update on public.music_activities
  for each row execute function public.lp_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) BUCKET DE ARQUIVOS
--    Público, igual ao bucket "worksheets" que a Biblioteca já usa.
--    Se preferir fechar depois, basta public = false e trocar as
--    URLs diretas por URLs assinadas em supabase.js.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do update set public = true;

drop policy if exists "music files public read" on storage.objects;
create policy "music files public read" on storage.objects
  for select using (bucket_id = 'music');

drop policy if exists "music files coord insert" on storage.objects;
create policy "music files coord insert" on storage.objects
  for insert with check (bucket_id = 'music' and is_coordinator());

drop policy if exists "music files coord update" on storage.objects;
create policy "music files coord update" on storage.objects
  for update using (bucket_id = 'music' and is_coordinator())
  with check (bucket_id = 'music' and is_coordinator());

drop policy if exists "music files coord delete" on storage.objects;
create policy "music files coord delete" on storage.objects
  for delete using (bucket_id = 'music' and is_coordinator());

-- Recarrega o schema cache do PostgREST para a tabela nova valer já.
notify pgrst, 'reload schema';
