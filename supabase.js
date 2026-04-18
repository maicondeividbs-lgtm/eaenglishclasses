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
