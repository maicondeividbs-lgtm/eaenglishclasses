// Função serverless da Vercel — envia push para o(s) aparelho(s) do usuário.
// Acionada por um Database Webhook do Supabase ou por chamada direta autenticada.
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
//   EA_PUSH_SECRET  (mesmo segredo enviado pelo webhook)
//   SITE_URL        (opcional) base para imagens. Padrão: https://www.eaenglishclasses.com.br

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://www.eaenglishclasses.com.br').replace(/\/+$/, '');

// Identidade visual das categorias (emoji + rótulo da ação rápida)
const CAT = {
  homework:  { emoji: '📚', action: 'Abrir Homework' },
  feedback:  { emoji: '📝', action: 'Ver Feedback' },
  aviso:     { emoji: '📢', action: 'Ler Aviso' },
  evento:    { emoji: '📅', action: 'Ver Evento' },
  contrato:  { emoji: '💳', action: 'Ver Contrato' },
  aula:      { emoji: '🎓', action: 'Ver Aula' },
  redacao:   { emoji: '✍️', action: 'Abrir Redação' },
  pronuncia: { emoji: '🎙️', action: 'Praticar' },
  vocab:     { emoji: '📚', action: 'Estudar' },
  nivel:     { emoji: '🎯', action: 'Ver no painel' },
  mensagem:  { emoji: '📨', action: 'Ver Mensagem' },
  pergunta:  { emoji: '💬', action: 'Ver no painel' }
};

async function sbSelect(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  return r.ok ? r.json() : [];
}
async function sbDelete(path) {
  await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
}
async function lookupTask(taskId) {
  if (!taskId) return null;
  const rows = await sbSelect(`tasks?id=eq.${encodeURIComponent(taskId)}&select=teacher_id,title`);
  return (rows && rows[0]) || null;
}
async function nameOf(userId) {
  if (!userId) return '';
  const rows = await sbSelect(`profiles?id=eq.${encodeURIComponent(userId)}&select=full_name`);
  const n = rows && rows[0] && rows[0].full_name;
  return n ? String(n).trim().split(/\s+/)[0] : '';
}

// Define destinatário + conteúdo (títulos claros, humanos e informativos).
async function resolve(table, rec, old) {
  switch (table) {
    case 'task_submissions': {
      const t = await lookupTask(rec.task_id);
      if (rec.status && rec.status !== 'pending') {
        if (t && t.teacher_id) return { byUser: t.teacher_id, cat: 'homework',
          title: '📚 Homework entregue', body: 'A tarefa “' + (t.title || 'homework') + '” foi entregue e está pronta para correção.' };
        return null;
      }
      if (!rec.student_id) return null;
      return { byUser: rec.student_id, cat: 'homework', title: '📚 Nova atividade disponível',
        body: (t && t.title ? 'Sua atividade “' + t.title + '” já está disponível.' : 'Sua nova atividade já está disponível no painel.') };
    }
    case 'feedbacks':
      if (!rec.student_id) return null;
      return { byUser: rec.student_id, cat: 'feedback', title: '📝 Novo feedback',
        body: (rec.title ? '“' + rec.title + '” — ' : '') + 'um novo feedback está disponível para consulta.' };
    case 'writing_activities':
      if (rec.status === 'graded') return { byUser: rec.student_id, cat: 'redacao', title: '✅ Redação corrigida',
        body: (rec.title ? '“' + rec.title + '” ' : 'Sua redação ') + 'recebeu comentários e nota.' };
      if (rec.status === 'submitted') return { byUser: rec.teacher_id, cat: 'redacao', title: '✍️ Redação enviada',
        body: 'Um aluno enviou uma redação para correção.' };
      return { byUser: rec.student_id, cat: 'redacao', title: '✍️ Novo tema de redação',
        body: (rec.title ? '“' + rec.title + '” ' : 'Há um novo tema ') + 'para você escrever.' };
    case 'pronunciation':
      if (!rec.student_id) return null;
      return { byUser: rec.student_id, cat: 'pronuncia', title: '🎙️ Nova prática de pronúncia',
        body: 'Pratique a palavra enviada pelo seu professor.' };
    case 'vocabulary_words':
      if (!rec.student_id) return null;
      return { byUser: rec.student_id, cat: 'vocab', title: '📚 Novo vocabulário',
        body: 'Novas palavras foram adicionadas para você estudar.' };
    case 'coord_messages':
      if (!rec.teacher_id) return null;
      return { byUser: rec.teacher_id, cat: 'mensagem', title: '📨 Mensagem da coordenação',
        body: rec.title || 'Você tem uma nova mensagem da coordenação.' };
    case 'placement_tests':
      return { byRole: 'coordinator', cat: 'nivel', title: '🎯 Novo nivelamento',
        body: (rec.full_name ? rec.full_name + ' ' : 'Um novo lead ') + 'solicitou uma aula experimental.' };
    case 'announcements':
      return { byRole: rec.target_role || null, cat: 'aviso', title: '📢 ' + (rec.title || 'Novo aviso'),
        body: rec.content ? String(rec.content).slice(0, 120) : (rec.title || 'Há um novo comunicado no painel.') };
    case 'help_requests': {
      // Professor respondeu → notifica o ALUNO
      if (rec.status === 'answered' && rec.answer) {
        if (old && old.status === 'answered') return null;       // evita re-notificar (ex.: marcar como lido)
        if (!rec.student_id) return null;
        return { byUser: rec.student_id, cat: 'pergunta', title: '💬 Resposta do seu professor',
          body: (rec.subject ? '“' + rec.subject + '” — ' : '') + 'seu professor respondeu sua pergunta.' };
      }
      // Nova pergunta (somente na criação) → notifica o PROFESSOR
      if (old) return null;                                       // updates que não são resposta não notificam
      if (!rec.teacher_id) return null;
      return { byUser: rec.teacher_id, cat: 'pergunta', title: '❓ Nova pergunta de aluno',
        body: (rec.subject ? '“' + rec.subject + '” — ' : '') + 'um aluno enviou uma pergunta para você.' };
    }
    default:
      return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ea-secret');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  try {
    const secret = req.headers['x-ea-secret'] || (req.query && req.query.secret);
    if (!process.env.EA_PUSH_SECRET || secret !== process.env.EA_PUSH_SECRET) {
      res.status(401).json({ error: 'unauthorized' }); return;
    }
    const envOk = {
      SUPABASE_URL: !!SB_URL, SUPABASE_SERVICE_ROLE_KEY: !!SB_KEY,
      VAPID_PUBLIC: !!process.env.VAPID_PUBLIC, VAPID_PRIVATE: !!process.env.VAPID_PRIVATE,
      VAPID_SUBJECT: !!process.env.VAPID_SUBJECT
    };
    if (!SB_URL || !SB_KEY || !process.env.VAPID_PRIVATE || !process.env.VAPID_PUBLIC) {
      res.status(500).json({ error: 'missing env', envPresent: envOk }); return;
    }

    let webpush;
    try { const mod = await import('web-push'); webpush = mod.default || mod; }
    catch (e) { res.status(500).json({ error: 'web-push não carregou', detail: String(e) }); return; }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:eaenglished@gmail.com',
      process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE
    );

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    // Helper que monta o payload visual padronizado
    function buildPayload(o) {
      const c = CAT[o.cat] || {};
      return JSON.stringify({
        title: o.title, body: o.body, url: o.url || '/login',
        cat: o.cat || 'geral', tag: 'ea-' + (o.cat || 'notif'),
        actionLabel: c.action || 'Abrir', image: o.image || null
      });
    }

    // Teste: { test:true, user_id:"...", cat? }
    if (body.test && body.user_id) {
      const tsubs = await sbSelect(`push_subscriptions?user_id=eq.${body.user_id}&select=endpoint,subscription`);
      const nm = await nameOf(body.user_id);
      const tpayload = buildPayload({
        cat: body.cat || 'aviso',
        title: body.title || '🔔 Teste — EA English Classes',
        body: (nm ? 'Olá, ' + nm + '! ' : '') + (body.body || 'Se você recebeu isto, o push está funcionando!'),
        url: '/login'
      });
      let tsent = 0; const errors = [];
      await Promise.all((tsubs || []).map(async (s) => {
        try { await webpush.sendNotification(s.subscription, tpayload); tsent++; }
        catch (err) { errors.push(err && err.statusCode ? err.statusCode : String(err)); }
      }));
      res.status(200).json({ test: true, candidates: (tsubs || []).length, sent: tsent, errors });
      return;
    }

    const table = body.table || null;
    const rec = body.record || body.new || {};
    const old = body.old_record || body.old || null;
    if (!table || !rec) { res.status(200).json({ skipped: 'no record' }); return; }

    const r = await resolve(table, rec, old);
    if (!r) { res.status(200).json({ skipped: 'no mapping' }); return; }

    let subs = [];
    if (r.byUser) subs = await sbSelect(`push_subscriptions?user_id=eq.${r.byUser}&select=endpoint,subscription`);
    else if (r.byRole) subs = await sbSelect(`push_subscriptions?role=eq.${r.byRole}&select=endpoint,subscription`);
    else subs = await sbSelect(`push_subscriptions?select=endpoint,subscription`);

    // Personaliza pelo primeiro nome quando o destino é um usuário específico
    let bodyText = r.body;
    if (r.byUser) {
      const nm = await nameOf(r.byUser);
      if (nm) bodyText = 'Olá, ' + nm + '! ' + r.body;
    }
    const payload = buildPayload({ cat: r.cat, title: r.title, body: bodyText, url: r.url || '/login', image: r.image });

    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try { await webpush.sendNotification(s.subscription, payload); sent++; }
      catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await sbDelete(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`);
        }
      }
    }));

    res.status(200).json({ ok: true, cat: r.cat, sent, candidates: (subs || []).length });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: String((e && e.stack) || e) });
  }
}
