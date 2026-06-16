-- ═══════════════════════════════════════════════════════════════
-- DETALHES DO NIVELAMENTO — EA English Classes
-- Adiciona campos para a coordenação agendar a aula experimental
-- de cada lead (data, horário, nível, livro, professor, observações).
-- Rode no Supabase → SQL Editor. É seguro rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

alter table public.placement_tests
  add column if not exists scheduled_date      date,
  add column if not exists scheduled_time      text,
  add column if not exists assigned_level      text,
  add column if not exists assigned_book        text,
  add column if not exists assigned_teacher_id uuid references public.profiles(id) on delete set null,
  add column if not exists coord_notes         text;

create index if not exists idx_placement_assigned_teacher
  on public.placement_tests(assigned_teacher_id);

-- Observações:
-- • Nenhuma política de RLS precisa mudar: a coordenação já atualiza
--   placement_tests (mesma permissão usada em "Marcar contatado").
-- • Os campos são todos opcionais — leads antigos continuam funcionando
--   normalmente, sem detalhes preenchidos.
