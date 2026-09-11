-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO — "infinite recursion detected in policy for relation profiles"
--
-- CAUSA (confirmada pelo diagnóstico):
--   A policy "delete_profiles" consulta a própria profiles dentro do USING:
--     USING (EXISTS (SELECT 1 FROM profiles profiles_1
--                    WHERE profiles_1.id = auth.uid()
--                      AND profiles_1.role = 'coordinator'))
--   Para avaliar esse SELECT interno o Postgres precisa aplicar de novo as
--   policies de profiles — que incluem esta — e a avaliação nunca termina.
--
--   As demais policies de profiles NÃO têm esse problema: usam my_role(),
--   is_coordinator() e is_my_student(), que são SECURITY DEFINER e por isso
--   leem profiles sem reentrar no RLS. Só esta escapou do padrão.
--
-- POR QUE É SEGURO REMOVER:
--   Existe uma segunda policy de DELETE — "profiles_delete_coordinator" —
--   que concede exatamente a mesma permissão (coordenação pode excluir),
--   escrita da forma correta: USING (my_role() = 'coordinator').
--   Policies PERMISSIVE se somam por OR, então "delete_profiles" era
--   redundante: não adicionava permissão nenhuma, só a recursão.
--   Nenhum acesso é perdido.
--
-- Rode no Supabase → SQL Editor. Idempotente: pode rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "delete_profiles" on public.profiles;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — o resultado abaixo deve mostrar:
--   1) exatamente UMA policy de DELETE: profiles_delete_coordinator
--   2) nenhuma policy de profiles citando "FROM profiles"
--   3) my_role() com security_definer = true
-- ─────────────────────────────────────────────────────────────
select secao, item, detalhe from (

  select 1 as ord,
         '1. DELETE em profiles' as secao,
         policyname as item,
         'USING: ' || coalesce(qual, '-') as detalhe
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and cmd = 'DELETE'

  union all

  select 2,
         '2. Policy de profiles ainda recursiva',
         policyname || '  [' || cmd || ']',
         'USING: ' || coalesce(qual, '-')
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and (coalesce(qual, '') ~* 'from[[:space:]]+profiles'
      or coalesce(with_check, '') ~* 'from[[:space:]]+profiles')

  union all

  select 3,
         '3. Funcao usada pelas policies',
         p.proname || '()',
         'security_definer=' || p.prosecdef::text ||
         '  |  ' || pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'my_role'

) x
order by ord, item;
