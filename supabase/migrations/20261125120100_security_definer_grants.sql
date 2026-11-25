-- Revisão das funções SECURITY DEFINER do schema public.
--
-- Todas já têm search_path fixo (search_path=public). O problema era o
-- EXECUTE concedido a PUBLIC/anon em funções que visitantes não precisam chamar.
-- Atenção: REVOKE de "anon" sozinho não basta quando existe grant para PUBLIC.

-- 1) Função de trigger: nunca deve ser chamável via RPC por ninguém.
revoke all on function public.schedule_slot_bind_student() from public, anon, authenticated;

-- 2) Usada só dentro de student_can_see_survey() (SECURITY DEFINER, roda como
--    dono). Visitante anônimo não tem motivo para chamar.
revoke all on function public.student_active_teacher() from public, anon;
grant execute on function public.student_active_teacher() to authenticated;

-- 3) student_teachers / student_teachers_bulk (chamadas via RPC pelos painéis).
--    Revisadas: só retornam dados se auth.uid() for o próprio aluno, um professor
--    dele (teaches_student) ou a coordenação. Garantimos que anon/PUBLIC não executem.
revoke all on function public.student_teachers(uuid) from public, anon;
revoke all on function public.student_teachers_bulk(uuid[]) from public, anon;
grant execute on function public.student_teachers(uuid) to authenticated;
grant execute on function public.student_teachers_bulk(uuid[]) to authenticated;

-- 4) MANTIDAS executáveis por anon, de propósito: is_coordinator, is_staff,
--    my_role, is_my_student, teaches_student, owns_task, is_assigned_to_me,
--    student_can_see_survey. Elas aparecem em policies RLS aplicadas ao papel
--    "public" (ex.: testimonials, que a home lê sem login). Se anon perder o
--    EXECUTE, essas consultas passam a falhar com "permission denied for function".
--    Para anon, todas retornam false/null (dependem de auth.uid()), sem vazar dados.
