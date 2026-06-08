// Função serverless da Vercel — envia push para o(s) aparelho(s) do usuário.
// Acionada por um Database Webhook do Supabase (INSERT/UPDATE nas tabelas de
// notificação) ou por chamada direta autenticada.
//
// Variáveis de ambiente necessárias (painel da Vercel):
//   SUPABASE_URL                 ex.: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    (segredo do Supabase — Project Settings > API)
//   VAPID_PUBLIC                 chave pública VAPID
//   VAPID_PRIVATE                chave privada VAPID (segredo)
//   VAPID_SUBJECT                ex.: mailto:eaenglished@gmail.com
//   EA_PUSH_SECRET               um segredo qualquer; o mesmo é enviado pelo webhook
import webpush from 'web-push';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Define quem recebe e a mensagem, a partir da linha alterada.
function resolve(table, rec) {
  switch (table) {
    case 'task_submissions':
      return { byUser: rec.student_id, title: '📝 Novo homework', body: 'Você recebeu uma nova tarefa.' };
    case 'feedbacks':
      return { byUser: rec.student_id, title: '💬 Novo feedback', body: 'Seu professor deixou um feedback para você.' };
    case 'writing_activities':
      if (rec.status === 'graded') return { byUser: rec.student_id, title: '✅ Redação corrigida', body: (rec.title || 'Sua redação') + ' — veja os comentários.' };
      if (rec.status === 'submitted') return { byUser: rec.teacher_id, title: '✍️ Redação enviada', body: 'Um aluno enviou uma redação para correção.' };
      return { byUser: rec.student_id, title: '✍️ Novo tema de redação', body: (rec.title || 'Há um novo tema') + ' para você escrever.' };
    case 'coord_messages':
      return { byUser: rec.teacher_id, title: '📨 Mensagem da coordenação', body: rec.title || 'Você tem uma nova mensagem.' };
    case 'placement_tests':
      return { byRole: 'coordinator', title: '🎯 Novo nivelamento', body: (rec.full_name ? rec.full_name + ' ' : '') + 'solicitou uma aula experimental.' };
    case 'announcements':
      return { byRole: rec.target_role || null, title: '📢 Novo aviso', body: rec.title || 'Há um novo comunicado.' };
    default:
      return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  // Autenticação simples por segredo compartilhado
  const secret = req.headers['x-ea-secret'] || (req.query && req.query.secret);
  if (!process.env.EA_PUSH_SECRET || secret !== process.env.EA_PUSH_SECRET) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  if (!SB_URL || !SB_KEY || !process.env.VAPID_PRIVATE) {
    res.status(500).json({ error: 'missing env' }); return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:eaenglished@gmail.com',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  // Modo de teste: { test:true, user_id:"..." } envia um push direto para o aparelho daquele usuário.
  if (body && body.test && body.user_id) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:eaenglished@gmail.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
    const tsubs = await sbSelect(`push_subscriptions?user_id=eq.${body.user_id}&select=endpoint,subscription`);
    const tpayload = JSON.stringify({ title: body.title || '🔔 Teste EA', body: body.body || 'Se você recebeu isto, o push está funcionando!', url: '/login.html', tag: 'ea-test' });
    let tsent = 0; const errors = [];
    await Promise.all((tsubs || []).map(async (s) => {
      try { await webpush.sendNotification(s.subscription, tpayload); tsent++; }
      catch (err) { errors.push(err && err.statusCode ? err.statusCode : String(err)); }
    }));
    res.status(200).json({ test: true, candidates: (tsubs || []).length, sent: tsent, errors });
    return;
  }

  const table = body.table || (body.record && body.type ? body.table : null);
  const rec = body.record || body.new || {};
  if (!table || !rec) { res.status(200).json({ skipped: 'no record' }); return; }

  const r = resolve(table, rec);
  if (!r) { res.status(200).json({ skipped: 'no mapping' }); return; }

  // Busca as inscrições push do destinatário
  let subs = [];
  if (r.byUser) subs = await sbSelect(`push_subscriptions?user_id=eq.${r.byUser}&select=endpoint,subscription`);
  else if (r.byRole) subs = await sbSelect(`push_subscriptions?role=eq.${r.byRole}&select=endpoint,subscription`);
  else subs = await sbSelect(`push_subscriptions?select=endpoint,subscription`);

  const payload = JSON.stringify({ title: r.title, body: r.body, url: '/login.html', tag: 'ea-' + table });
  let sent = 0;
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, payload);
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await sbDelete(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`);
      }
    }
  }));

  res.status(200).json({ ok: true, sent, candidates: (subs || []).length });
}
