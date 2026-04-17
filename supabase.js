// ═══════════════════════════════════════════════════════
// EA ENGLISH CLASSES — SUPABASE CONNECTION
// This file handles all communication with the database
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = 'https://ktdrgvlyrotqpzlunlqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHJndmx5cm90cXB6bHVubHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MDA2NTEsImV4cCI6MjA5MTk3NjY1MX0.Hb8e7YV-tCS89Sj7PuAUn_M1movtSGArvQXtWLdlmdQ';

// Initialize Supabase client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══ PLACEMENT TEST (Agendamento de Nivelamento) ═══
async function submitPlacementTest(formData) {
  const { data, error } = await db
    .from('placement_tests')
    .insert([{
      full_name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      preferred_date: formData.preferredDate || null,
      preferred_time: formData.preferredTime || null,
      current_level: formData.currentLevel,
      message: formData.message || null,
      status: 'pending'
    }]);

  if (error) throw error;
  return data;
}

// ═══ AUTHENTICATION ═══
async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({
    email: email,
    password: password
  });
  if (error) throw error;
  return data;
}

async function signUp(email, password, fullName, role = 'student') {
  const { data, error } = await db.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        full_name: fullName,
        role: role
      }
    }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await db.auth.signOut();
  if (error) throw error;
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

  if (error) return null;
  return data;
}

// ═══ DASHBOARD DATA ═══

// Student: Get my tasks
async function getMyTasks(studentId) {
  const { data, error } = await db
    .from('task_submissions')
    .select(`
      *,
      task:tasks(*)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Student: Get my feedbacks
async function getMyFeedbacks(studentId) {
  const { data, error } = await db
    .from('feedbacks')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get announcements for current user role
async function getAnnouncements(role) {
  const { data, error } = await db
    .from('announcements')
    .select('*')
    .or(`target_role.is.null,target_role.eq.${role}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
}

// Teacher: Get my students
async function getMyStudents(teacherId) {
  const { data, error } = await db
    .from('enrollments')
    .select(`
      *,
      student:profiles!enrollments_student_id_fkey(*),
      course:courses(*)
    `)
    .eq('teacher_id', teacherId)
    .eq('active', true);

  if (error) throw error;
  return data;
}

// Coordinator: Get all profiles
async function getAllProfiles() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Coordinator: Get placement test requests
async function getPlacementTests() {
  const { data, error } = await db
    .from('placement_tests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get courses
async function getCourses() {
  const { data, error } = await db
    .from('courses')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

// ═══ UTILITY ═══
function redirectByRole(role) {
  switch(role) {
    case 'student': window.location.href = 'dashboard-aluno.html'; break;
    case 'teacher': window.location.href = 'dashboard-professor.html'; break;
    case 'coordinator': window.location.href = 'dashboard-coordenacao.html'; break;
    default: window.location.href = 'dashboard-aluno.html';
  }
}

// Check auth on dashboard pages
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}
