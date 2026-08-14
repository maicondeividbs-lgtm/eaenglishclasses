// ═══════════════════════════════════════════════════════
// EA ENGLISH CLASSES — SUPABASE CONNECTION v2
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = 'https://ktdrgvlyrotqpzlunlqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHJndmx5cm90cXB6bHVubHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MDA2NTEsImV4cCI6MjA5MTk3NjY1MX0.Hb8e7YV-tCS89Sj7PuAUn_M1movtSGArvQXtWLdlmdQ';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══ AUTH ═══
async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  // Mostra uma notificação de saída antes de redirecionar.
  try { if (typeof showToast === 'function') showToast('Você saiu da sua conta. Até logo! 👋'); } catch (e) {}
  try { await db.auth.signOut(); } catch (e) {}
  // Desktop volta para a página inicial do site; no app fica no login (sem escapar do app).
  var isApp = (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(max-width: 900px)').matches)) || navigator.standalone === true;
  var dest = isApp ? '/login' : '/';
  setTimeout(function () { window.location.href = dest; }, 850);
}

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getUserProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single();
  return data;
}

async function requireAuth(allowedRoles) {
  const session = await getSession();
  if (!session) { window.location.href = '/login'; return null; }
  const profile = await getUserProfile();
  if (!profile) { window.location.href = '/login'; return null; }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.href = '/login';
    return null;
  }
  return profile;
}

function redirectByRole(role) {
  const routes = { student: '/dashboard-aluno', teacher: '/dashboard-professor', coordinator: '/dashboard-coordenacao' };
  window.location.href = routes[role] || '/dashboard-aluno';
}

// ═══ PLACEMENT TESTS ═══
async function submitPlacementTest(formData) {
  const { error } = await db.from('placement_tests').insert([{
    full_name: formData.fullName, email: formData.email, phone: formData.phone,
    preferred_date: formData.preferredDate || null, preferred_time: formData.preferredTime || null,
    current_level: formData.currentLevel, message: formData.message || null, status: 'pending'
  }]);
  if (error) throw error;
}

// ═══ PROFILES ═══
async function getAllStudents() {
  const { data } = await db.from('profiles').select('*').eq('role','student').eq('active',true).order('full_name');
  return data || [];
}
async function getAllTeachers() {
  const { data } = await db.from('profiles').select('*').eq('role','teacher').eq('active',true).order('full_name');
  return data || [];
}
async function getAllProfiles() {
  const { data } = await db.from('profiles').select('*').order('created_at',{ascending:false});
  return data || [];
}

// ═══ ACCESS LOGS (Registro de acessos de alunos) ═══
// Registra um acesso ao site. Chamado no login e ao abrir os painéis.
// TRAVA CENTRAL: para não duplicar (login + dashboard + reaberturas do PWA),
// registra no máximo 1 acesso por usuário a cada 30 min por dispositivo.
// A trava fica AQUI (fonte única) usando localStorage — que persiste entre
// abas e cold starts do PWA, ao contrário do sessionStorage usado nas páginas.
async function logStudentAccess(userId, fullName, role) {
  try {
    if (!userId || !role) return;

    const WINDOW_MS = 30 * 60 * 1000; // 30 minutos
    const key = 'ea_acc_ts_' + userId;

    // Já registrou recentemente? Então ignora (evita o registro em duplicidade).
    try {
      const last = parseInt(localStorage.getItem(key) || '0', 10);
      if (last && (Date.now() - last) < WINDOW_MS) {
        return;
      }
    } catch (_) { /* localStorage indisponível: segue e registra mesmo assim */ }

    const { error } = await db.from('access_logs').insert([{
      user_id: userId,
      full_name: fullName || null,
      role: role
    }]);
    if (error) {
      // Não bloqueia o login, mas deixa o erro claro no console para diagnóstico.
      console.error('[access_logs] Falha ao registrar acesso:', error.message, error);
      return;
    }
    // Marca o horário SÓ após o insert dar certo (assim um erro não suprime o próximo).
    try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
    console.log('[access_logs] Acesso registrado com sucesso.');
  } catch (e) {
    // Falha no registro não deve bloquear o login
    console.error('[access_logs] Exceção ao registrar acesso:', e);
  }
}

// Busca os registros de acesso (uso do coordenador). Mais recentes primeiro.
async function getAccessLogs(limit) {
  const { data } = await db
    .from('access_logs')
    .select('*')
    .order('accessed_at', { ascending: false })
    .limit(limit || 300);
  return data || [];
}

// Busca os acessos SOMENTE dos alunos vinculados a um professor.
// Dupla camada de segurança contra vazamento de dados:
//   1) RLS no banco já restringe o professor aos acessos dos seus alunos;
//   2) aqui filtramos explicitamente pelos ids dos próprios alunos e pelo
//      papel 'student'. Assim o professor nunca vê acessos de outros alunos
//      nem de outros professores/coordenação, mesmo que algo mude no banco.
async function getAccessLogsForMyStudents(teacherId, limit) {
  if (!teacherId) return [];
  // Descobre quem são os alunos deste professor (matrículas ativas).
  const students = await getMyStudents(teacherId);
  const ids = (students || []).map(s => s && s.id).filter(Boolean);
  if (!ids.length) return [];
  // Lê os acessos somente desses alunos e apenas registros de papel 'student'.
  const { data, error } = await db
    .from('access_logs')
    .select('id, user_id, full_name, role, accessed_at')
    .in('user_id', ids)
    .eq('role', 'student')
    .order('accessed_at', { ascending: false })
    .limit(limit || 400);
  if (error) {
    console.error('[access_logs] getAccessLogsForMyStudents:', error.message);
    return [];
  }
  return data || [];
}

// ═══ TASKS (HOMEWORK) ═══
async function createTask(title, description, teacherId, studentIds, dueDate) {
  const { data, error } = await db.from('tasks').insert([{
    title, description, teacher_id: teacherId, due_date: dueDate || null
  }]).select();
  if (error) throw error;
  if (data && data[0] && studentIds && studentIds.length) {
    const subs = studentIds.map(sid => ({ task_id: data[0].id, student_id: sid, status: 'pending' }));
    await db.from('task_submissions').insert(subs);
  }
  return data;
}

async function getTasksByTeacher(teacherId) {
  const { data } = await db.from('tasks').select('*, task_submissions(*, student:profiles(full_name))').eq('teacher_id',teacherId).order('created_at',{ascending:false});
  return data || [];
}

async function getTasksForStudent(studentId) {
  const { data } = await db.from('task_submissions').select('*, task:tasks(*)').eq('student_id',studentId).order('created_at',{ascending:false});
  // não mostra ao aluno os homeworks cujo envio foi cancelado pelo professor
  return (data || []).filter(s => !(s.task && s.task.cancelled));
}

// ═══ CANCELAMENTO DE ENVIOS (marca como cancelado; some para o destinatário) ═══
async function cancelTask(taskId) {
  const { error } = await db.from('tasks').update({ cancelled: true, cancelled_at: new Date().toISOString() }).eq('id', taskId);
  if (error) throw error;
}
async function cancelFeedback(feedbackId) {
  const { error } = await db.from('feedbacks').update({ cancelled: true, cancelled_at: new Date().toISOString() }).eq('id', feedbackId);
  if (error) throw error;
}
async function cancelAnnouncement(announcementId) {
  const { error } = await db.from('announcements').update({ cancelled: true, cancelled_at: new Date().toISOString() }).eq('id', announcementId);
  if (error) throw error;
}

async function markTaskDone(submissionId) {
  const { error } = await db.from('task_submissions').update({status:'submitted',submitted_at:new Date().toISOString()}).eq('id',submissionId);
  if (error) throw error;
}

// ═══ FEEDBACKS ═══
async function createFeedback(teacherId, studentId, title, content, category) {
  const { error } = await db.from('feedbacks').insert([{teacher_id:teacherId,student_id:studentId,title,content,category}]);
  if (error) throw error;
}

async function getFeedbacksByTeacher(teacherId) {
  const { data } = await db.from('feedbacks').select('*, student:profiles!feedbacks_student_id_fkey(full_name)').eq('teacher_id',teacherId).order('created_at',{ascending:false});
  return data || [];
}

async function getFeedbacksForStudent(studentId) {
  const { data } = await db.from('feedbacks').select('*, teacher:profiles!feedbacks_teacher_id_fkey(full_name)').eq('student_id',studentId).eq('cancelled',false).order('created_at',{ascending:false});
  return data || [];
}

// ═══ ANNOUNCEMENTS ═══
async function createAnnouncement(authorId, title, content, targetRole) {
  const { error } = await db.from('announcements').insert([{author_id:authorId,title,content,target_role:targetRole||null}]);
  if (error) throw error;
}

async function getAnnouncements() {
  const { data } = await db.from('announcements').select('*, author:profiles!announcements_author_id_fkey(full_name)').eq('cancelled',false).order('created_at',{ascending:false}).limit(20);
  return data || [];
}

// Versão para a equipe (professor/coordenação): inclui avisos cancelados, para gerir/auditar
async function getAllAnnouncements() {
  const { data } = await db.from('announcements').select('*, author:profiles!announcements_author_id_fkey(full_name)').order('created_at',{ascending:false}).limit(40);
  return data || [];
}

// ═══ GUARDA COMPARTILHADA — helpers de escopo do professor ═══
// IDs dos alunos que o professor atende hoje (matrícula ativa).
async function teacherStudentIds(teacherId) {
  try {
    const mine = await getMyStudents(teacherId);
    return (mine || []).map(s => s.id).filter(Boolean);
  } catch (e) { return []; }
}

// Conta redações num status, cobrindo os alunos compartilhados.
async function countTeacherWritings(teacherId, status) {
  const ids = await teacherStudentIds(teacherId);
  let q = db.from('writing_activities').select('id', { count: 'exact', head: true });
  q = ids.length
    ? q.or('teacher_id.eq.' + teacherId + ',student_id.in.(' + ids.join(',') + ')')
    : q.eq('teacher_id', teacherId);
  return await q.eq('status', status);
}

// Co-professores de VÁRIOS alunos numa única chamada (evita N requisições
// ao pintar a lista de alunos). Devolve { student_id: [nomes] }.
async function getCoTeachersMap(studentIds, exceptTeacherId) {
  const ids = (studentIds || []).filter(Boolean);
  if (!ids.length) return {};
  try {
    const { data, error } = await db.rpc('student_teachers_bulk', { p_students: ids });
    if (error) return {};
    const map = {};
    (data || []).forEach(function (r) {
      if (!r.student_id || !r.teacher_id) return;
      if (r.teacher_id === exceptTeacherId) return;
      (map[r.student_id] = map[r.student_id] || []).push(r.full_name);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) { return String(a).localeCompare(String(b), 'pt', { sensitivity: 'base' }); });
    });
    return map;
  } catch (e) { return {}; }
}

// ═══ WRITING ═══
async function createWritingActivity(teacherId, studentId, title, prompt, dueDate) {
  const { error } = await db.from('writing_activities').insert([{teacher_id:teacherId,student_id:studentId,title,prompt,due_date:dueDate||null,status:'pending'}]);
  if (error) throw error;
}

// GUARDA COMPARTILHADA: o professor vê (e corrige) as redações de TODOS os
// alunos que ele atende — inclusive os temas propostos pelo co-professor.
// Mantém também as redações que ele mesmo criou, mesmo que o vínculo com o
// aluno tenha sido encerrado depois (não some histórico da tela).
async function getWritingByTeacher(teacherId) {
  const cols = '*, student:profiles!writing_activities_student_id_fkey(full_name), teacher:profiles!writing_activities_teacher_id_fkey(full_name), reviewer:profiles!writing_activities_reviewed_by_fkey(full_name)';
  const fallbackCols = '*, student:profiles!writing_activities_student_id_fkey(full_name), teacher:profiles!writing_activities_teacher_id_fkey(full_name)';

  let ids = [];
  try {
    const mine = await getMyStudents(teacherId);
    ids = (mine || []).map(s => s.id).filter(Boolean);
  } catch (e) { ids = []; }

  const orFilter = ids.length
    ? 'teacher_id.eq.' + teacherId + ',student_id.in.(' + ids.join(',') + ')'
    : null;

  async function run(select) {
    let q = db.from('writing_activities').select(select);
    q = orFilter ? q.or(orFilter) : q.eq('teacher_id', teacherId);
    return await q.order('created_at', { ascending: false });
  }

  // A coluna reviewed_by é criada por guarda-compartilhada.sql. Se ainda não
  // existir no banco, cai para o select sem ela em vez de quebrar a tela.
  let r = await run(cols);
  if (r.error) r = await run(fallbackCols);
  return r.data || [];
}

async function getWritingForStudent(studentId) {
  const { data } = await db.from('writing_activities').select('*, teacher:profiles!writing_activities_teacher_id_fkey(full_name)').eq('student_id',studentId).order('created_at',{ascending:false});
  return data || [];
}

async function submitWritingResponse(activityId, responseText) {
  const { error } = await db.from('writing_activities').update({response:responseText,status:'submitted',submitted_at:new Date().toISOString()}).eq('id',activityId);
  if (error) throw error;
}

// Registra QUEM corrigiu — com dois professores por aluno, o autor do tema
// e o corretor podem ser pessoas diferentes.
async function gradeWriting(activityId, feedback, grade, reviewerId) {
  const base = { feedback, grade, status: 'graded', reviewed_at: new Date().toISOString() };
  const who = reviewerId || (window.currentUser && window.currentUser.id) || null;

  let r = who
    ? await db.from('writing_activities').update(Object.assign({ reviewed_by: who }, base)).eq('id', activityId)
    : await db.from('writing_activities').update(base).eq('id', activityId);

  // Se a coluna reviewed_by ainda não existe no banco, grava sem ela.
  if (r.error && /reviewed_by/.test(r.error.message || '')) {
    r = await db.from('writing_activities').update(base).eq('id', activityId);
  }
  if (r.error) throw r.error;
}

// ═══ PRONUNCIATION ═══
async function createPronunciation(teacherId, studentId, word, phonetic, notes) {
  const { error } = await db.from('pronunciation').insert([{teacher_id:teacherId,student_id:studentId,word,phonetic:phonetic||null,notes:notes||null}]);
  if (error) throw error;
}

async function getPronunciationByTeacher(teacherId) {
  const { data } = await db.from('pronunciation').select('*, student:profiles!pronunciation_student_id_fkey(full_name)').eq('teacher_id',teacherId).order('created_at',{ascending:false});
  return data || [];
}

async function getPronunciationForStudent(studentId) {
  const { data } = await db.from('pronunciation').select('*').eq('student_id',studentId).order('created_at',{ascending:false});
  return data || [];
}

async function markPronunciationPracticed(pronId) {
  const { error } = await db.from('pronunciation').update({practiced:true}).eq('id',pronId);
  if (error) throw error;
}

// ═══ COORD MESSAGES ═══
async function sendCoordMessage(authorId, teacherId, title, content) {
  const { error } = await db.from('coord_messages').insert([{author_id:authorId,teacher_id:teacherId,title,content}]);
  if (error) throw error;
}

async function getCoordMessagesForTeacher(teacherId) {
  const { data } = await db.from('coord_messages').select('*, author:profiles!coord_messages_author_id_fkey(full_name)').eq('teacher_id',teacherId).order('created_at',{ascending:false});
  return data || [];
}

async function markMessageRead(msgId) {
  const { error } = await db.from('coord_messages').update({read:true}).eq('id',msgId);
  if (error) throw error;
}

// ═══ STATS ═══
async function getPlacementTests() {
  const { data } = await db.from('placement_tests').select('*').order('created_at',{ascending:false});
  return data || [];
}

async function getCourses() {
  const { data } = await db.from('courses').select('*').order('sort_order');
  return data || [];
}


// Get students enrolled with a specific teacher
async function getMyStudents(teacherId) {
  const { data } = await db
    .from('enrollments')
    .select('student_id, course:courses(name, cefr_level), student:profiles!enrollments_student_id_fkey(id, full_name, email, level)')
    .eq('teacher_id', teacherId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  
  if (!data) return [];
  
  // Deduplicate by student_id
  const seen = new Set();
  const unique = [];
  for (const d of data) {
    if (d.student && !seen.has(d.student.id)) {
      seen.add(d.student.id);
      unique.push({
        ...d.student,
        course_name: d.course?.name || '',
        cefr: d.course?.cefr_level || ''
      });
    }
  }
  return unique;
}

// ═══ PLANOS DE AULA (lesson_plans + lesson_plan_entries) ═══
// plan_month é sempre o dia 1 do mês (string 'YYYY-MM-01').
function lpMonthKey(year, month) {
  return year + '-' + String(month).padStart(2, '0') + '-01';
}

// Busca o plano (cabeçalho + linhas) de um professor/aluno/mês.
// Retorna null se ainda não existir.
async function getLessonPlan(teacherId, studentId, monthKey) {
  const { data: plan } = await db.from('lesson_plans')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .eq('plan_month', monthKey)
    .maybeSingle();
  if (!plan) return null;
  const { data: entries } = await db.from('lesson_plan_entries')
    .select('*')
    .eq('plan_id', plan.id)
    .order('lesson_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });
  plan.entries = entries || [];
  return plan;
}

// Salva o plano inteiro de forma atômica-por-partes:
//   1) upsert do cabeçalho (chave única teacher+student+month)
//   2) troca completa das linhas (apaga as antigas, insere as atuais).
// rows = [{lesson_date, topic, pages, homework, last_homework}]
// Colunas da v2 (lesson_plans_v2.sql): book_pages + last_auto. Enquanto o SQL
// não for rodado no Supabase, o app degrada com elegância e salva sem elas.
let _lpHasV2 = true;
function _lpMissingV2Column(err) {
  const m = ((err && (err.message || err.details || err.hint)) || '').toLowerCase();
  return m.indexOf('book_pages') >= 0 || m.indexOf('last_auto') >= 0;
}

async function saveLessonPlan(teacherId, studentId, monthKey, header, rows) {
  const buildHeader = (v2) => {
    const h = {
      teacher_id: teacherId,
      student_id: studentId,
      plan_month: monthKey,
      book:  header.book  || null,
      level: header.level || null,
      notes: header.notes || null,
      updated_at: new Date().toISOString()
    };
    if (v2) h.book_pages = (header.book_pages != null && header.book_pages !== '') ? parseInt(header.book_pages, 10) || null : null;
    return h;
  };

  let up = await db.from('lesson_plans')
    .upsert([buildHeader(_lpHasV2)], { onConflict: 'teacher_id,student_id,plan_month' })
    .select().single();
  if (up.error && _lpHasV2 && _lpMissingV2Column(up.error)) {
    _lpHasV2 = false;
    up = await db.from('lesson_plans')
      .upsert([buildHeader(false)], { onConflict: 'teacher_id,student_id,plan_month' })
      .select().single();
  }
  if (up.error) throw up.error;
  const plan = up.data;

  // Troca completa das linhas (planos são pequenos: poucas linhas por mês).
  const { error: delErr } = await db.from('lesson_plan_entries').delete().eq('plan_id', plan.id);
  if (delErr) throw delErr;

  const buildRows = (v2) => (rows || [])
    .map((r, i) => {
      const o = {
        plan_id: plan.id,
        lesson_date: r.lesson_date || null,
        topic: (r.topic || '').trim() || null,
        objective: (r.objective || '').trim() || null,
        pages: (r.pages || '').trim() || null,
        homework: (r.homework || '').trim() || null,
        last_homework: (r.last_homework || '').trim() || null,
        notes: (r.notes || '').trim() || null,
        sort_order: i
      };
      if (v2) o.last_auto = (r.last_auto !== false);
      return o;
    })
    // ignora linhas totalmente vazias
    .filter(r => r.lesson_date || r.topic || r.objective || r.pages || r.homework || r.last_homework || r.notes);

  const clean = buildRows(_lpHasV2);
  if (clean.length) {
    let ins = await db.from('lesson_plan_entries').insert(clean);
    if (ins.error && _lpHasV2 && _lpMissingV2Column(ins.error)) {
      _lpHasV2 = false;
      ins = await db.from('lesson_plan_entries').insert(buildRows(false));
    }
    if (ins.error) throw ins.error;
  }
  return plan;
}

async function deleteLessonPlan(planId) {
  const { error } = await db.from('lesson_plan_entries').delete().eq('plan_id', planId);
  if (error) throw error;
  const { error: e2 } = await db.from('lesson_plans').delete().eq('id', planId);
  if (e2) throw e2;
}

// Coordenação: todos os planos (cabeçalho + nomes), do mais recente ao mais antigo.
// As linhas são carregadas sob demanda por getLessonPlanEntries().
async function getAllLessonPlans() {
  const { data } = await db.from('lesson_plans')
    .select('*, teacher:profiles!lesson_plans_teacher_id_fkey(full_name), student:profiles!lesson_plans_student_id_fkey(full_name)')
    .order('plan_month', { ascending: false })
    .order('updated_at', { ascending: false });
  return data || [];
}

async function getLessonPlanEntries(planId) {
  const { data } = await db.from('lesson_plan_entries')
    .select('*')
    .eq('plan_id', planId)
    .order('lesson_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });
  return data || [];
}

// Histórico completo de planos de um aluno com o professor (todos os meses),
// já com as linhas embutidas. Base do cálculo de completude do curso.
async function getStudentPlanHistory(teacherId, studentId) {
  const cols = _lpHasV2 ? 'id, plan_month, book, level, book_pages' : 'id, plan_month, book, level';
  let res = await db.from('lesson_plans')
    .select(cols)
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('plan_month', { ascending: true });
  if (res.error && _lpHasV2 && _lpMissingV2Column(res.error)) {
    _lpHasV2 = false;
    res = await db.from('lesson_plans')
      .select('id, plan_month, book, level')
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .order('plan_month', { ascending: true });
  }
  const plans = res.data || [];
  if (!plans.length) return [];

  const { data: entries } = await db.from('lesson_plan_entries')
    .select('plan_id, lesson_date, pages, homework')
    .in('plan_id', plans.map(p => p.id));

  const byPlan = {};
  (entries || []).forEach(e => { (byPlan[e.plan_id] = byPlan[e.plan_id] || []).push(e); });
  plans.forEach(p => { p.entries = byPlan[p.id] || []; });
  return plans;
}

// Homeworks REALMENTE enviados a um aluno por este professor, em ordem
// cronológica. Usado para descobrir qual foi o último homework antes de
// cada aula do plano (campo "Last homework").
async function getTasksSentToStudent(teacherId, studentId) {
  const { data } = await db.from('task_submissions')
    .select('id, status, submitted_at, created_at, task:tasks!inner(id, title, description, due_date, created_at, teacher_id, cancelled)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true });
  return (data || [])
    .filter(s => s.task && String(s.task.teacher_id) === String(teacherId) && !s.task.cancelled)
    .map(s => ({
      id: s.task.id,
      title: (s.task.title || '').trim(),
      description: s.task.description || '',
      due_date: s.task.due_date || null,
      sent_at: s.task.created_at || s.created_at || null,
      status: s.status || 'pending',
      submitted_at: s.submitted_at || null
    }))
    .filter(t => t.sent_at)
    .sort((a, b) => (a.sent_at < b.sent_at ? -1 : a.sent_at > b.sent_at ? 1 : 0));
}

// ═══ SPEAKING — observações do professor por aluno/data ═══
// Um bloco de texto por data (mesmo formato do bloco de notas do professor).
async function getSpeakingNotes(teacherId, studentId) {
  const { data, error } = await db.from('speaking_notes')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .order('note_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Salva (upsert) o bloco de uma data. Conteúdo vazio remove o bloco.
async function saveSpeakingNote(teacherId, studentId, noteDate, content) {
  const txt = (content || '').trim();
  if (!txt) {
    const { error } = await db.from('speaking_notes').delete()
      .eq('teacher_id', teacherId).eq('student_id', studentId).eq('note_date', noteDate);
    if (error) throw error;
    return null;
  }
  const { data, error } = await db.from('speaking_notes')
    .upsert([{
      teacher_id: teacherId,
      student_id: studentId,
      note_date: noteDate,
      content: txt,
      updated_at: new Date().toISOString()
    }], { onConflict: 'teacher_id,student_id,note_date' })
    .select().single();
  if (error) throw error;
  return data;
}

async function deleteSpeakingNote(noteId) {
  const { error } = await db.from('speaking_notes').delete().eq('id', noteId);
  if (error) throw error;
}

// Monta o HTML imprimível de um plano no layout da "Preparação de aulas".
// Usado tanto no painel do professor quanto no da coordenação (via window.print()).
// header = {student, book, level, monthLabel, teacher?}
function eaBuildLessonPlanPrintHTML(header, rows) {
  const e = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt = (d) => {
    if (!d) return '';
    const p = String(d).split('-');
    return p.length === 3 ? (p[2] + '/' + p[1]) : e(d);
  };
  const body = (rows && rows.length ? rows : []).map(r => {
    const topicCell = '<div class="lpp-topic">' + e(r.topic) + '</div>' +
      (r.objective ? '<div class="lpp-obj"><span>Objetivo:</span> ' + e(r.objective) + '</div>' : '');
    let tr = '<tr>' +
        '<td class="lpp-c-date">' + fmt(r.lesson_date) + '</td>' +
        '<td>' + topicCell + '</td>' +
        '<td class="lpp-c-pages">' + e(r.pages) + '</td>' +
        '<td>' + e(r.homework).replace(/\n/g,'<br>') + '</td>' +
        '<td class="lpp-c-last">' + e(r.last_homework) + '</td>' +
      '</tr>';
    if (r.notes) {
      tr += '<tr class="lpp-obs-row"><td></td><td colspan="4"><span>Obs.:</span> ' + e(r.notes).replace(/\n/g,'<br>') + '</td></tr>';
    }
    return tr;
  }).join('');
  const filler = Math.max(0, 6 - (rows ? rows.length : 0));
  let fillerRows = '';
  for (let i = 0; i < filler; i++) fillerRows += '<tr class="lpp-empty"><td></td><td></td><td></td><td></td><td></td></tr>';
  return '' +
    '<div class="lpp-doc">' +
      '<div class="lpp-head">' +
        '<div class="lpp-brand">EA<span>ENGLISH CLASSES</span></div>' +
        '<div class="lpp-meta">' +
          '<div><strong>Aluno</strong> ' + e(header.student) + '</div>' +
          '<div><strong>Livro</strong> ' + e(header.book) + '</div>' +
          '<div><strong>Nível de proficiência</strong> ' + e(header.level) + '</div>' +
          (header.teacher ? '<div><strong>Professor</strong> ' + e(header.teacher) + '</div>' : '') +
          (header.progress ? '<div><strong>Avan\u00e7o no livro</strong> ' + e(header.progress) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="lpp-title">Preparação de aulas' + (header.monthLabel ? ' — ' + e(header.monthLabel) : '') + '</div>' +
      '<table class="lpp-table">' +
        '<thead><tr>' +
          '<th class="lpp-c-date">DATA</th><th>TÓPICO</th><th class="lpp-c-pages">PÁGINAS (PREVISÃO)</th>' +
          '<th>HOMEWORK</th><th class="lpp-c-last">LAST HOMEWORK</th>' +
        '</tr></thead>' +
        '<tbody>' + body + fillerRows + '</tbody>' +
      '</table>' +
      eaBuildSpeakingPrintHTML(header.speaking, e) +
    '</div>';
}

// Bloco opcional de observa\u00e7\u00f5es de speaking no fim do documento imprim\u00edvel.
// speaking = [{note_date:'YYYY-MM-DD', content:'- item;\\n- item;'}]
function eaBuildSpeakingPrintHTML(speaking, e) {
  if (!speaking || !speaking.length) return '';
  const esc = e || ((s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
  const blocks = speaking.map(n => {
    const p = String(n.note_date || '').split('-');
    const d = p.length === 3 ? (p[2] + '/' + p[1]) : '';
    const items = String(n.content || '').split('\n')
      .map(l => l.replace(/^\s*[-\u2022*]\s*/, '').replace(/\s*;\s*$/, '').trim())
      .filter(Boolean)
      .map(l => '<li>' + esc(l) + '</li>').join('');
    if (!items) return '';
    return '<div class="lpp-sp-block"><div class="lpp-sp-date">' + esc(d) + '</div><ul>' + items + '</ul></div>';
  }).join('');
  if (!blocks) return '';
  return '<div class="lpp-sp"><div class="lpp-sp-title">Speaking \u2014 observa\u00e7\u00f5es</div>' + blocks + '</div>';
}

// Injeta o documento numa área imprimível (filha direta de <body>) e chama print().
// A classe body.lp-printing (ver style.css) esconde o resto só durante a impressão.
function eaPrintLessonPlan(header, rows) {
  let area = document.getElementById('lpPrintArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'lpPrintArea';
    document.body.appendChild(area);
  }
  area.innerHTML = eaBuildLessonPlanPrintHTML(header, rows);
  const cleanup = () => {
    document.body.classList.remove('lp-printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  document.body.classList.add('lp-printing');
  setTimeout(() => { window.print(); }, 60);
}

// ═══ UTILITIES ═══
function formatDate(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '-'; }
function formatDateTime(d) { return d ? new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '-'; }
function timeAgo(d) { if(!d)return''; const s=Math.floor((Date.now()-new Date(d))/1000); if(s<60)return'agora'; if(s<3600)return Math.floor(s/60)+'min'; if(s<86400)return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; }
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;color:#fff;background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#f59a1e'};box-shadow:0 8px 24px rgba(0,0,0,0.2);transition:all 0.4s;opacity:0;transform:translateY(-10px)`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateY(0)'});
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-10px)';setTimeout(()=>t.remove(),400)},3000);
}

// ═══ TESTIMONIALS (Public feedback) ═══
async function submitTestimonial(name, text, rating) {
  const { error } = await db.from('testimonials').insert([{author_name:name, content:text, rating:rating, approved:false}]);
  if (error) throw error;
}

async function getApprovedTestimonials() {
  const { data } = await db.from('testimonials').select('*').eq('approved',true).order('created_at',{ascending:false}).limit(12);
  return data || [];
}

async function getAllTestimonials() {
  const { data } = await db.from('testimonials').select('*').order('created_at',{ascending:false});
  return data || [];
}

async function approveTestimonial(id) {
  const { error } = await db.from('testimonials').update({approved:true}).eq('id',id);
  if (error) throw error;
}

async function deleteTestimonial(id) {
  const { error } = await db.from('testimonials').delete().eq('id',id);
  if (error) throw error;
}

// ═══ USER MANAGEMENT (Coord) ═══
// A criação de usuários é feita por uma Edge Function ('create-user'),
// que roda no servidor com a service role key. Isso cria a conta SEM
// trocar a sessão da coordenação (o bug do antigo signUp) e mantém a
// service role key fora do navegador.
async function createNewUser(email, password, fullName, role) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await db.functions.invoke('create-user', {
    body: { email: email, password: password, full_name: fullName, role: role }
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function deleteUser(userId) {
  // Delete profile (cascades to enrollments, submissions, etc.)
  const { error } = await db.from('profiles').delete().eq('id', userId);
  if (error) throw error;
}

// ═══ NOTIFICATIONS ═══
async function getUnreadCount(userId, role) {
  let count = 0;
  try {
    if (role === 'student') {
      const [tasks, writing, feedbacks] = await Promise.all([
        db.from('task_submissions').select('id',{count:'exact',head:true}).eq('student_id',userId).eq('status','pending'),
        db.from('writing_activities').select('id',{count:'exact',head:true}).eq('student_id',userId).eq('status','pending'),
        db.from('feedbacks').select('id',{count:'exact',head:true}).eq('student_id',userId)
      ]);
      count = (tasks.count||0) + (writing.count||0);
    } else if (role === 'teacher') {
      const [writing, msgs] = await Promise.all([
        countTeacherWritings(userId, 'submitted'),
        db.from('coord_messages').select('id',{count:'exact',head:true}).eq('teacher_id',userId).eq('read',false)
      ]);
      count = (writing.count||0) + (msgs.count||0);
    } else if (role === 'coordinator') {
      const placements = await db.from('placement_tests').select('id',{count:'exact',head:true}).eq('status','pending');
      count = placements.count||0;
    }
  } catch(e) { console.error('Notification count error:', e); }
  return count;
}

// Returns a flat list of notification items (recent events) for the bell dropdown.
// We use a recency-window approach: items created/updated in the last 14 days,
// limited to the most recent 20. Each item: { type, icon, title, sub, when, section, badge }
async function getNotificationItems(userId, role) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const items = [];

  try {
    if (role === 'student') {
      // Homework atribuído (task_submissions pending) — recent
      const subs = await db.from('task_submissions')
        .select('id, status, created_at, task:tasks(title, cancelled, teacher:profiles!tasks_teacher_id_fkey(full_name))')
        .eq('student_id', userId).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (subs.data || []).forEach(s => {
        if (s.task && s.task.cancelled) return; // envio cancelado: não notifica
        const isPending = s.status === 'pending';
        items.push({
          type: 'homework', icon: '📝',
          title: (isPending ? 'Novo homework: ' : 'Homework: ') + (s.task?.title || 'sem título'),
          sub: (s.task?.teacher?.full_name || 'Professor') + (isPending ? ' • aguardando sua entrega' : ''),
          when: s.created_at, section: 'homework', isNew: isPending
        });
      });

      // Redações: status submitted → aguardando | graded → corrigida
      const wr = await db.from('writing_activities')
        .select('id, title, status, created_at, reviewed_at, teacher:profiles!writing_activities_teacher_id_fkey(full_name)')
        .eq('student_id', userId).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (wr.data || []).forEach(w => {
        if (w.status === 'pending') {
          items.push({ type: 'writing', icon: '✍️', title: 'Tema de redação: ' + (w.title||''), sub: (w.teacher?.full_name||'Professor') + ' • escreva sua resposta', when: w.created_at, section: 'writing', isNew: true });
        } else if (w.status === 'graded') {
          items.push({ type: 'writing', icon: '✅', title: 'Redação corrigida: ' + (w.title||''), sub: (w.teacher?.full_name||'Professor') + ' • veja os comentários', when: w.reviewed_at || w.created_at, section: 'writing', isNew: true });
        }
      });

      // Feedbacks recebidos
      const fb = await db.from('feedbacks')
        .select('id, title, created_at, teacher:profiles!feedbacks_teacher_id_fkey(full_name)')
        .eq('student_id', userId).eq('cancelled', false).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (fb.data || []).forEach(f => {
        items.push({ type: 'feedback', icon: '💬', title: 'Feedback: ' + (f.title||''), sub: (f.teacher?.full_name||'Professor'), when: f.created_at, section: 'feedback' });
      });

      // Avisos (announcements) gerais
      const ann = await db.from('announcements')
        .select('id, title, created_at, author:profiles!announcements_author_id_fkey(full_name)')
        .eq('cancelled', false).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (ann.data || []).forEach(a => {
        items.push({ type: 'announcement', icon: '📢', title: 'Aviso: ' + (a.title||''), sub: (a.author?.full_name||'EA English'), when: a.created_at, section: 'announcements' });
      });

      // Respostas a help_requests
      try {
        const helps = await db.from('help_requests')
          .select('id, subject, answered_at, status, teacher:profiles!help_requests_teacher_id_fkey(full_name)')
          .eq('student_id', userId).eq('status', 'answered').gte('answered_at', cutoff)
          .order('answered_at', { ascending: false }).limit(10);
        (helps.data || []).forEach(h => {
          items.push({ type: 'help', icon: '✅', title: 'Professor respondeu sua dúvida' + (h.subject ? ': ' + h.subject : ''), sub: (h.teacher?.full_name||'Professor'), when: h.answered_at, section: null, isNew: true });
        });
      } catch(e) { /* table may not exist */ }

    } else if (role === 'teacher') {
      // Redações submitted (aluno enviou)
      const wrIds = await teacherStudentIds(userId);
      let wrQ = db.from('writing_activities')
        .select('id, title, submitted_at, student:profiles!writing_activities_student_id_fkey(full_name)');
      wrQ = wrIds.length
        ? wrQ.or('teacher_id.eq.' + userId + ',student_id.in.(' + wrIds.join(',') + ')')
        : wrQ.eq('teacher_id', userId);
      const wr = await wrQ.eq('status','submitted').gte('submitted_at', cutoff)
        .order('submitted_at', { ascending: false }).limit(10);
      (wr.data || []).forEach(w => {
        items.push({ type: 'writing', icon: '✍️', title: 'Redação aguardando correção: ' + (w.title||''), sub: (w.student?.full_name||'Aluno'), when: w.submitted_at, section: 'writing', isNew: true });
      });

      // Homework entregue (task_submissions submitted/completed)
      const subs = await db.from('task_submissions')
        .select('id, status, submitted_at, task:tasks(title), student:profiles!task_submissions_student_id_fkey(full_name)')
        .eq('status','submitted').gte('submitted_at', cutoff)
        .order('submitted_at', { ascending: false }).limit(10);
      (subs.data || []).forEach(s => {
        items.push({ type: 'homework', icon: '📥', title: 'Homework entregue: ' + (s.task?.title||''), sub: (s.student?.full_name||'Aluno'), when: s.submitted_at, section: 'homework' });
      });

      // Mensagens da coord
      const msgs = await db.from('coord_messages')
        .select('id, title, created_at, read, author:profiles!coord_messages_author_id_fkey(full_name)')
        .eq('teacher_id', userId).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (msgs.data || []).forEach(m => {
        items.push({ type: 'message', icon: '✉️', title: 'Coordenação: ' + (m.title||''), sub: (m.author?.full_name||''), when: m.created_at, section: 'messages', isNew: !m.read });
      });

      // Help requests recebidos (perguntas dos alunos)
      try {
        const helps = await db.from('help_requests')
          .select('id, subject, message, created_at, status, student:profiles!help_requests_student_id_fkey(full_name)')
          .eq('teacher_id', userId).gte('created_at', cutoff)
          .order('created_at', { ascending: false }).limit(10);
        (helps.data || []).forEach(h => {
          const isOpen = h.status !== 'answered';
          items.push({ type: 'help', icon: '❓', title: 'Pergunta de aluno' + (h.subject ? ': ' + h.subject : ''), sub: (h.student?.full_name||'Aluno'), when: h.created_at, section: 'help-requests', isNew: isOpen });
        });
      } catch(e) { /* table may not exist */ }

    } else if (role === 'coordinator') {
      // Nivelamentos pendentes
      const pl = await db.from('placement_tests')
        .select('id, full_name, created_at, status')
        .eq('status','pending').gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (pl.data || []).forEach(p => {
        items.push({ type: 'placement', icon: '📅', title: 'Novo nivelamento: ' + (p.full_name||''), sub: 'Aguardando agendamento', when: p.created_at, section: 'nivelamento', isNew: true });
      });

      // Redações submitted no sistema
      const wr = await db.from('writing_activities')
        .select('id, title, submitted_at, student:profiles!writing_activities_student_id_fkey(full_name), teacher:profiles!writing_activities_teacher_id_fkey(full_name)')
        .eq('status','submitted').gte('submitted_at', cutoff)
        .order('submitted_at', { ascending: false }).limit(10);
      (wr.data || []).forEach(w => {
        items.push({ type: 'writing', icon: '✍️', title: 'Redação aguardando correção', sub: (w.student?.full_name||'Aluno') + ' → Prof. ' + (w.teacher?.full_name||'?'), when: w.submitted_at, section: 'supervision' });
      });

      // Avisos recentes
      const ann = await db.from('announcements')
        .select('id, title, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(5);
      (ann.data || []).forEach(a => {
        items.push({ type: 'announcement', icon: '📢', title: 'Aviso publicado: ' + (a.title||''), sub: '', when: a.created_at, section: 'announcements' });
      });
    }
  } catch(e) { console.error('Notification items error:', e); }

  // Sort all items by recency
  items.sort((a, b) => (new Date(b.when||0)) - (new Date(a.when||0)));
  return items.slice(0, 20);
}


// ═══ SCHEDULE ═══
async function getScheduleSlots(teacherId) {
  const { data } = await db.from('schedule_slots').select('*').eq('teacher_id', teacherId).order('day_of_week').order('time_slot');
  return data || [];
}

async function addScheduleSlot(teacherId, dayOfWeek, timeSlot, studentName, studentLevel, duration) {
  const { data, error } = await db.from('schedule_slots').upsert([{
    teacher_id: teacherId, day_of_week: dayOfWeek, time_slot: timeSlot,
    student_name: studentName, student_level: studentLevel || '', duration_minutes: duration || 60
  }], { onConflict: 'teacher_id,day_of_week,time_slot' }).select();
  if (error) throw error;
  return data;
}

// Slots de vários professores de uma vez (guarda compartilhada).
async function getScheduleSlotsMulti(teacherIds) {
  const ids = (teacherIds || []).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await db.from('schedule_slots').select('*')
    .in('teacher_id', ids).order('day_of_week').order('time_slot');
  return data || [];
}

// Grade semanal do aluno: junta os slots de TODOS os professores dele e
// devolve já ordenada e com o nome do professor em cada aula.
async function getStudentScheduleSlots(studentId, studentName) {
  const teachers = await getStudentTeachers(studentId);
  if (!teachers.length) return { teachers: [], slots: [] };
  const nameById = {};
  teachers.forEach(t => { nameById[t.teacher_id] = t.teacher_name; });
  const all = await getScheduleSlotsMulti(teachers.map(t => t.teacher_id));
  const mine = String(studentName || '').trim().toLowerCase();
  const slots = (all || [])
    .filter(s => s.student_name && s.student_name.trim().toLowerCase() === mine)
    .map(s => Object.assign({}, s, { teacher_name: nameById[s.teacher_id] || '' }));
  slots.sort((a, b) => a.day_of_week !== b.day_of_week
    ? a.day_of_week - b.day_of_week
    : String(a.time_slot || '').localeCompare(String(b.time_slot || '')));
  return { teachers: teachers, slots: slots };
}

async function removeScheduleSlot(slotId) {
  const { error } = await db.from('schedule_slots').delete().eq('id', slotId);
  if (error) throw error;
}

async function getScheduleEvents(teacherId, month, year) {
  const startDate = year + '-' + String(month).padStart(2,'0') + '-01';
  const endDate = month === 12 ? (year+1) + '-01-01' : year + '-' + String(month+1).padStart(2,'0') + '-01';
  const { data } = await db.from('schedule_events').select('*, creator:profiles!schedule_events_created_by_fkey(full_name)').eq('teacher_id', teacherId).gte('event_date', startDate).lt('event_date', endDate).order('event_date');
  return data || [];
}

async function addScheduleEvent(slotId, teacherId, eventDate, eventType, notes, createdBy, studentName, repDay, repTime) {
  const row = {
    teacher_id: teacherId, event_date: eventDate,
    event_type: eventType, notes: notes || '', created_by: createdBy, student_name: studentName || ''
  };
  if (slotId) row.slot_id = slotId;
  if (repDay !== undefined) row.replacement_day = String(repDay);
  if (repTime) row.replacement_time = repTime;
  const { error } = await db.from('schedule_events').insert([row]);
  if (error) throw error;
}

async function removeScheduleEvent(eventId) {
  const { error } = await db.from('schedule_events').delete().eq('id', eventId);
  if (error) throw error;
}

const MONTHS = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ═══ AVATAR UPLOAD ═══
async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  // Remove old avatar
  await db.storage.from('avatars').remove([path]);
  // Upload new
  const { error } = await db.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) throw error;
  // Get public URL
  const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
  const url = urlData.publicUrl + '?t=' + Date.now();
  // Update profile
  await db.from('profiles').update({ avatar_url: url }).eq('id', userId);
  return url;
}

// ═══ ASSESSMENTS ═══
async function uploadAssessment(teacherId, studentId, month, year, title, file) {
  const ext = file.name.split('.').pop();
  const path = `${studentId}/${year}-${String(month).padStart(2,'0')}.${ext}`;
  // Upload file
  const { error: upErr } = await db.storage.from('assessments').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  // Get public URL
  const { data: urlData } = db.storage.from('assessments').getPublicUrl(path);
  const fileUrl = urlData.publicUrl;
  // Save metadata
  const { error: dbErr } = await db.from('assessments').upsert([{
    teacher_id: teacherId,
    student_id: studentId,
    month: month,
    year: year,
    title: title,
    file_path: path,
    file_url: fileUrl
  }], { onConflict: 'student_id,month,year' });
  if (dbErr) throw dbErr;
  return fileUrl;
}

async function getAssessmentsByTeacher(teacherId) {
  const { data } = await db.from('assessments').select('*, student:profiles!assessments_student_id_fkey(full_name)').eq('teacher_id', teacherId).order('year', {ascending:false}).order('month', {ascending:false});
  return data || [];
}

async function getAssessmentsForStudent(studentId) {
  const { data } = await db.from('assessments').select('*, teacher:profiles!assessments_teacher_id_fkey(full_name)').eq('student_id', studentId).order('year', {ascending:false}).order('month', {ascending:false});
  return data || [];
}



// ═══════════════════════════════════════════════════════
// REGISTRO DE NOTAS DE AVALIAÇÕES (Coordenação)
// Tabela: 'assessment_grades'
// Cada avaliação tem 3 notas (0-100): oral / written / assessment.
// A média é (oral + written + assessment) / 3.
// São 2 avaliações por livro:
//   Interchange → período "1-8" e "9-16"
//   Evolve      → período "1-6" e "7-12"
// ═══════════════════════════════════════════════════════

// Registra uma nova avaliação de um aluno.
async function saveAssessmentGrade(coordinatorId, data) {
  const { data: row, error } = await db.from('assessment_grades').insert([{
    student_id:    data.studentId,
    registered_by: coordinatorId,
    book:          data.book,
    period:        data.period,
    exam_date:     data.examDate || null,
    oral_score:    data.oralScore,
    written_score: data.writtenScore,
    assessment_score: data.assessmentScore,
    final_average: data.finalAverage,
    notes:         data.notes || null
  }]).select();
  if (error) throw error;
  return row && row[0];
}

// Atualiza uma avaliação existente.
async function updateAssessmentGrade(gradeId, data) {
  const { error } = await db.from('assessment_grades').update({
    book:          data.book,
    period:        data.period,
    exam_date:     data.examDate || null,
    oral_score:    data.oralScore,
    written_score: data.writtenScore,
    assessment_score: data.assessmentScore,
    final_average: data.finalAverage,
    notes:         data.notes || null
  }).eq('id', gradeId);
  if (error) throw error;
}

// Lista as avaliações de um aluno (mais recentes primeiro).
async function getAssessmentGrades(studentId) {
  const { data } = await db.from('assessment_grades')
    .select('*, registrant:profiles!assessment_grades_registered_by_fkey(full_name)')
    .eq('student_id', studentId)
    .order('exam_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  return data || [];
}

// Contagem de avaliações por aluno — usada para os badges da lista.
async function getAssessmentCounts() {
  const { data } = await db.from('assessment_grades').select('student_id');
  const counts = {};
  (data || []).forEach(g => { counts[g.student_id] = (counts[g.student_id] || 0) + 1; });
  return counts;
}

// Exclui uma avaliação.
async function deleteAssessmentGrade(gradeId) {
  const { error } = await db.from('assessment_grades').delete().eq('id', gradeId);
  if (error) throw error;
}

// Lista as avaliações do próprio aluno (uso do dashboard do aluno).
// A RLS garante que o aluno só enxergue as próprias notas.
async function getMyAssessmentGrades(studentId) {
  const { data } = await db.from('assessment_grades')
    .select('*')
    .eq('student_id', studentId)
    .order('exam_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });
  return data || [];
}

// ═══════════════════════════════════════════════════════
// VOCABULÁRIO (Professor → Aluno)
// Tabela: 'vocabulary_words'
// O professor envia apenas as palavras vistas em aula.
// O dashboard do aluno gera tradução e frase de exemplo
// automaticamente (via IA) e salva o resultado de volta.
// A pronúncia é gerada no navegador (Web Speech API).
// Campos: word, translation, sentence, part_of_speech, enriched
// ═══════════════════════════════════════════════════════

// Envia uma lista de palavras de uma vez para um aluno.
// Cada registro nasce "não enriquecido" (sem tradução/frase).
async function addVocabularyWords(teacherId, studentId, words) {
  const rows = words.map(w => ({
    teacher_id: teacherId,
    student_id: studentId,
    word: w,
    enriched: false
  }));
  const { data, error } = await db.from('vocabulary_words').insert(rows).select();
  if (error) throw error;
  return data || [];
}

// Lista as palavras enviadas por um professor (mais recentes primeiro).
async function getVocabularyByTeacher(teacherId) {
  const { data } = await db.from('vocabulary_words')
    .select('*, student:profiles!vocabulary_words_student_id_fkey(full_name)')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  return data || [];
}

// Lista as palavras de vocabulário do próprio aluno.
// A RLS garante que o aluno só veja as próprias palavras.
async function getVocabularyForStudent(studentId) {
  const { data } = await db.from('vocabulary_words')
    .select('*, teacher:profiles!vocabulary_words_teacher_id_fkey(full_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  return data || [];
}

// Salva o conteúdo gerado (tradução, frase, classe gramatical) de uma palavra.
async function saveVocabularyEnrichment(wordId, translation, sentence, partOfSpeech) {
  const { error } = await db.from('vocabulary_words').update({
    translation: translation,
    sentence: sentence || null,
    part_of_speech: partOfSpeech || null,
    enriched: true
  }).eq('id', wordId);
  if (error) throw error;
}

// Exclui uma palavra de vocabulário.
async function deleteVocabularyWord(wordId) {
  const { error } = await db.from('vocabulary_words').delete().eq('id', wordId);
  if (error) throw error;
}

// ═══ LAST UPDATE INDICATOR ═══
function showLastUpdate() {
  const el = document.getElementById('lastUpdate');
  if (el) {
    const now = new Date();
    el.textContent = 'Atualizado às ' + now.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
    el.style.display = '';
  }
}

// ═══ GUARDA COMPARTILHADA — professores do aluno ═══
// Um aluno pode ter MAIS DE UM professor regular (matrículas ativas em
// enrollments). Esta é a única fonte de verdade para "quem ensina o aluno X".
// O critério de "ativo" espelha exatamente a helper de RLS teaches_student():
// coalesce(active, true) = true — ou seja, active NULL conta como ativo.
async function getStudentTeachers(studentId) {
  if (!studentId) return [];
  const { data, error } = await db
    .from('enrollments')
    .select('teacher_id, course_id, active, teacher:profiles!enrollments_teacher_id_fkey(id, full_name, avatar_url), course:courses(name, cefr_level)')
    .eq('student_id', studentId)
    .not('teacher_id', 'is', null);
  if (error) throw error;

  const seen = new Set();
  const out = [];
  for (const r of (data || [])) {
    if (r.active === false) continue;            // coalesce(active,true)=true
    if (!r.teacher_id || seen.has(r.teacher_id)) continue;
    seen.add(r.teacher_id);
    out.push({
      teacher_id: r.teacher_id,
      teacher: r.teacher || null,
      teacher_name: (r.teacher && r.teacher.full_name) || '',
      course_id: r.course_id || null,
      course_name: (r.course && r.course.name) || '',
      cefr: (r.course && r.course.cefr_level) || ''
    });
  }
  out.sort((a, b) => String(a.teacher_name).localeCompare(String(b.teacher_name), 'pt', { sensitivity: 'base' }));
  return out;
}

// Compatibilidade: devolve o PRIMEIRO professor, no mesmo formato de antes
// ({ teacher_id, teacher: { id, full_name } }). Mantida para não quebrar
// nenhuma chamada existente — telas novas devem usar getStudentTeachers().
async function getStudentMainTeacher(studentId) {
  const list = await getStudentTeachers(studentId);
  return list.length ? list[0] : null;
}

// Co-professores de um aluno, vistos por um professor/coordenação.
// Usa a RPC SECURITY DEFINER student_teachers() (ver guarda-compartilhada.sql).
// Se a RPC ainda não existir no banco, devolve [] sem quebrar a tela.
async function getStudentCoTeachers(studentId, exceptTeacherId) {
  if (!studentId) return [];
  try {
    const { data, error } = await db.rpc('student_teachers', { p_student: studentId });
    if (error) return [];
    return (data || []).filter(t => t.teacher_id && t.teacher_id !== exceptTeacherId);
  } catch (e) { return []; }
}

async function createHelpRequest(studentId, teacherId, subject, message) {
  const { error } = await db.from('help_requests').insert([{
    student_id: studentId,
    teacher_id: teacherId,
    subject: subject || null,
    message,
    status: 'open'
  }]);
  if (error) throw error;
}

async function getHelpRequestsForTeacher(teacherId) {
  const { data, error } = await db
    .from('help_requests')
    .select('*, student:profiles!help_requests_student_id_fkey(full_name)')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getHelpRequestsForStudent(studentId) {
  const { data, error } = await db
    .from('help_requests')
    .select('*, teacher:profiles!help_requests_teacher_id_fkey(full_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function answerHelpRequest(requestId, answer) {
  const { error } = await db
    .from('help_requests')
    .update({ answer, answered_at: new Date().toISOString(), status: 'answered' })
    .eq('id', requestId);
  if (error) throw error;
}

async function markHelpRead(requestId) {
  const { error } = await db
    .from('help_requests')
    .update({ read_at: new Date().toISOString() })
    .eq('id', requestId)
    .is('read_at', null);
  if (error) throw error;
}
