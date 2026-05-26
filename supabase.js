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
  await db.auth.signOut();
  window.location.href = 'login.html';
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
  if (!session) { window.location.href = 'login.html'; return null; }
  const profile = await getUserProfile();
  if (!profile) { window.location.href = 'login.html'; return null; }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.href = 'login.html';
    return null;
  }
  return profile;
}

function redirectByRole(role) {
  const routes = { student: 'dashboard-aluno.html', teacher: 'dashboard-professor.html', coordinator: 'dashboard-coordenacao.html' };
  window.location.href = routes[role] || 'dashboard-aluno.html';
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
// Registra um acesso do aluno ao site. Chamado no momento do login.
async function logStudentAccess(userId, fullName, role) {
  try {
    if (!userId || role !== 'student') return; // só registramos alunos
    const { error } = await db.from('access_logs').insert([{
      user_id: userId,
      full_name: fullName || null,
      role: role
    }]);
    if (error) {
      // Não bloqueia o login, mas deixa o erro claro no console para diagnóstico.
      console.error('[access_logs] Falha ao registrar acesso:', error.message, error);
    } else {
      console.log('[access_logs] Acesso registrado com sucesso.');
    }
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
  return data || [];
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
  const { data } = await db.from('feedbacks').select('*, teacher:profiles!feedbacks_teacher_id_fkey(full_name)').eq('student_id',studentId).order('created_at',{ascending:false});
  return data || [];
}

// ═══ ANNOUNCEMENTS ═══
async function createAnnouncement(authorId, title, content, targetRole) {
  const { error } = await db.from('announcements').insert([{author_id:authorId,title,content,target_role:targetRole||null}]);
  if (error) throw error;
}

async function getAnnouncements() {
  const { data } = await db.from('announcements').select('*, author:profiles!announcements_author_id_fkey(full_name)').order('created_at',{ascending:false}).limit(20);
  return data || [];
}

// ═══ WRITING ═══
async function createWritingActivity(teacherId, studentId, title, prompt, dueDate) {
  const { error } = await db.from('writing_activities').insert([{teacher_id:teacherId,student_id:studentId,title,prompt,due_date:dueDate||null,status:'pending'}]);
  if (error) throw error;
}

async function getWritingByTeacher(teacherId) {
  const { data } = await db.from('writing_activities').select('*, student:profiles!writing_activities_student_id_fkey(full_name)').eq('teacher_id',teacherId).order('created_at',{ascending:false});
  return data || [];
}

async function getWritingForStudent(studentId) {
  const { data } = await db.from('writing_activities').select('*, teacher:profiles!writing_activities_teacher_id_fkey(full_name)').eq('student_id',studentId).order('created_at',{ascending:false});
  return data || [];
}

async function submitWritingResponse(activityId, responseText) {
  const { error } = await db.from('writing_activities').update({response:responseText,status:'submitted',submitted_at:new Date().toISOString()}).eq('id',activityId);
  if (error) throw error;
}

async function gradeWriting(activityId, feedback, grade) {
  const { error } = await db.from('writing_activities').update({feedback,grade,status:'graded',reviewed_at:new Date().toISOString()}).eq('id',activityId);
  if (error) throw error;
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
        db.from('writing_activities').select('id',{count:'exact',head:true}).eq('teacher_id',userId).eq('status','submitted'),
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
        .select('id, status, created_at, task:tasks(title, teacher:profiles!tasks_teacher_id_fkey(full_name))')
        .eq('student_id', userId).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (subs.data || []).forEach(s => {
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
        .eq('student_id', userId).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(10);
      (fb.data || []).forEach(f => {
        items.push({ type: 'feedback', icon: '💬', title: 'Feedback: ' + (f.title||''), sub: (f.teacher?.full_name||'Professor'), when: f.created_at, section: 'feedback' });
      });

      // Avisos (announcements) gerais
      const ann = await db.from('announcements')
        .select('id, title, created_at, author:profiles!announcements_author_id_fkey(full_name)')
        .gte('created_at', cutoff)
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
      const wr = await db.from('writing_activities')
        .select('id, title, submitted_at, student:profiles!writing_activities_student_id_fkey(full_name)')
        .eq('teacher_id', userId).eq('status','submitted').gte('submitted_at', cutoff)
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

// ═══ LAST UPDATE INDICATOR ═══
function showLastUpdate() {
  const el = document.getElementById('lastUpdate');
  if (el) {
    const now = new Date();
    el.textContent = 'Atualizado às ' + now.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
    el.style.display = '';
  }
}

// ═══ HELP REQUESTS (Pedir ajuda ao professor) ═══
async function getStudentMainTeacher(studentId) {
  // Find first active enrollment with a teacher
  const { data, error } = await db
    .from('enrollments')
    .select('teacher_id, teacher:profiles!enrollments_teacher_id_fkey(id, full_name)')
    .eq('student_id', studentId)
    .not('teacher_id', 'is', null)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
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
