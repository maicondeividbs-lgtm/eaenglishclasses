// ═══════════════════════════════════════════════════════
// EA ENGLISH CLASSES — SUPABASE CONNECTION v2.1
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
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return data;
}

/**
 * Proteção de Rota: Verifica se o usuário está logado e se tem o cargo correto.
 * @param {string} requiredRole - 'aluno', 'professor' ou 'coordenacao'
 */
async function requireAuth(requiredRole) {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  
  const profile = await getUserProfile();
  if (!profile || (requiredRole && profile.role !== requiredRole)) {
    // Redireciona para o dashboard correto se tentar acessar área errada
    if (profile) {
        redirectByRole(profile.role);
    } else {
        window.location.href = 'login.html';
    }
    return null;
  }
  return { session, profile };
}

function redirectByRole(role) {
  const routes = {
    'aluno': 'dashboard-aluno.html',
    'professor': 'dashboard-professor.html',
    'coordenacao': 'dashboard-coordenacao.html'
  };
  window.location.href = routes[role] || 'index.html';
}

// ═══ DATA FETCHING ═══

// Busca lições/homeworks do aluno logado
async function getStudentHomework(studentId) {
    const { data } = await db
        .from('homework_submissions')
        .select('*, homeworks(title, due_date)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
    return data || [];
}

// Envia teste de nivelamento (Contato)
async function submitPlacementTest(formData) {
  const { error } = await db.from('placement_tests').insert([formData]);
  if (error) throw error;
  return true;
}

// ═══ UTILITIES ═══
function formatDate(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '-'; }
function formatDateTime(d) { 
    if(!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) + ' ' + 
           date.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}); 
}

function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;color:white;box-shadow:0 10px 30px rgba(0,0,0,0.1);transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);transform:translateY(-20px);opacity:0;`;
  t.style.backgroundColor = type === 'success' ? '#6daf5f' : '#e54d42';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.transform = 'translateY(0)'; t.style.opacity = '1'; }, 10);
  setTimeout(() => { t.style.transform = 'translateY(-20px)'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}
