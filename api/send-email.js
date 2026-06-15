// Função serverless da Vercel — envia e-mail (Resend) para o destinatário certo.
// Acionada por um Database Webhook do Supabase (INSERT/UPDATE nas tabelas de
// notificação) ou por chamada de teste autenticada.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   SUPABASE_URL                 ex.: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    (segredo do Supabase — Project Settings > API)
//   RESEND_API_KEY               (segredo do Resend — começa com "re_")
//   EA_PUSH_SECRET               o MESMO segredo já usado no push (o webhook envia junto)
// Opcionais:
//   EMAIL_FROM       remetente verificado. Padrão: EA English Classes <avisos@eaenglishclasses.com.br>
//   EMAIL_REPLY_TO   endereço de resposta (ex.: eaenglished@gmail.com)
//   SITE_URL         base dos links. Padrão: https://www.eaenglishclasses.com.br
//   EMAIL_LOGO_URL   logo do e-mail. Padrão: SITE_URL + '/icons/Logo_EA.jpg'

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'EA English Classes <avisos@eaenglishclasses.com.br>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || '';
const SITE_URL = (process.env.SITE_URL || 'https://www.eaenglishclasses.com.br').replace(/\/+$/, '');
const LOGO = process.env.EMAIL_LOGO_URL || (SITE_URL + '/icons/Logo_EA.jpg');

// ── Paleta oficial da marca ──
const C = { navy:'#19244e', blue:'#253c96', orange:'#f36b2e', mango:'#f59a1e', ocean:'#c4e7e5', cream:'#fef9f0' };

// ── Categorias visuais (cor de destaque + emoji + rótulo) ──
const CATS = {
  homework:  { color: C.orange, text: '#ffffff', emoji: '📚', label: 'Homework' },
  feedback:  { color: C.blue,   text: '#ffffff', emoji: '📝', label: 'Feedback' },
  aviso:     { color: C.mango,  text: C.navy,    emoji: '📢', label: 'Aviso' },
  evento:    { color: C.navy,   text: '#ffffff', emoji: '📅', label: 'Evento' },
  contrato:  { color: C.navy,   text: '#ffffff', emoji: '💳', label: 'Contrato' },
  aula:      { color: C.blue,   text: '#ffffff', emoji: '🎓', label: 'Aula' },
  redacao:   { color: C.blue,   text: '#ffffff', emoji: '✍️', label: 'Redação' },
  pronuncia: { color: C.mango,  text: C.navy,    emoji: '🎙️', label: 'Pronúncia' },
  vocab:     { color: C.orange, text: '#ffffff', emoji: '📚', label: 'Vocabulário' },
  nivel:     { color: C.navy,   text: '#ffffff', emoji: '🎯', label: 'Nivelamento' },
  mensagem:  { color: C.blue,   text: '#ffffff', emoji: '📨', label: 'Mensagem' },
  pergunta:  { color: C.blue,   text: '#ffffff', emoji: '💬', label: 'Pergunta' },
  geral:     { color: C.orange, text: '#ffffff', emoji: '✉️', label: 'EA English Classes' }
};

async function sbSelect(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  return r.ok ? r.json() : [];
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function firstName(name) {
  const n = String(name || '').trim();
  return n ? esc(n.split(/\s+/)[0]) : '';
}

async function emailsForUsers(ids) {
  const uniq = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniq.length) return [];
  const list = uniq.map(encodeURIComponent).join(',');
  const rows = await sbSelect(`profiles?id=in.(${list})&select=email,full_name`);
  return (rows || []).filter(r => r.email).map(r => ({ email: r.email, name: r.full_name }));
}
async function emailsForRoles(roles) {
  const out = [];
  for (const role of (roles || [])) {
    if (!role) continue;
    const rows = await sbSelect(`profiles?role=eq.${encodeURIComponent(role)}&active=eq.true&select=email,full_name`);
    (rows || []).forEach(r => { if (r.email) out.push({ email: r.email, name: r.full_name }); });
  }
  return out;
}
async function lookupTask(taskId) {
  if (!taskId) return null;
  const rows = await sbSelect(`tasks?id=eq.${encodeURIComponent(taskId)}&select=teacher_id,title`);
  return (rows && rows[0]) || null;
}

// Decide destinatário + conteúdo. Retorna { userIds?|roles?, cat, subject, heading, message, ctaLabel, path? }
async function plan(table, rec, old) {
  switch (table) {
    case 'task_submissions': {
      const delivered = rec.status && rec.status !== 'pending' && (!old || old.status !== rec.status);
      if (delivered) {
        const t = await lookupTask(rec.task_id);
        if (t && t.teacher_id) {
          return { userIds: [t.teacher_id], cat: 'homework', subject: '📬 Homework entregue',
            heading: 'Um aluno entregou um homework',
            message: 'A tarefa “' + (t.title || 'homework') + '” foi marcada como entregue e está pronta para sua correção.',
            ctaLabel: 'Ver entrega', path: '/login' };
        }
        return null;
      }
      const t = await lookupTask(rec.task_id);
      if (rec.student_id) {
        return { userIds: [rec.student_id], cat: 'homework', subject: '📚 Nova atividade disponível',
          heading: 'Sua nova atividade já está disponível',
          message: (t && t.title ? 'A atividade “' + t.title + '” já está no seu painel. ' : 'Há uma nova tarefa esperando por você no painel. ') + 'Bons estudos!',
          ctaLabel: 'Abrir homework', path: '/login' };
      }
      return null;
    }
    case 'feedbacks':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], cat: 'feedback', subject: '📝 Novo feedback disponível',
        heading: 'Seu professor deixou um novo feedback',
        message: (rec.title ? '“' + rec.title + '”. ' : '') + 'Um novo feedback já está disponível para consulta no seu painel.',
        ctaLabel: 'Ver feedback', path: '/login' };
    case 'writing_activities':
      if (rec.status === 'graded') {
        if (!rec.student_id) return null;
        return { userIds: [rec.student_id], cat: 'redacao', subject: '✅ Sua redação foi corrigida',
          heading: 'Sua redação foi corrigida',
          message: (rec.title ? '“' + rec.title + '” ' : 'Sua redação ') + 'recebeu comentários e nota. Confira o resultado no painel.',
          ctaLabel: 'Ver correção', path: '/login' };
      }
      if (rec.status === 'submitted') {
        if (!rec.teacher_id) return null;
        return { userIds: [rec.teacher_id], cat: 'redacao', subject: '✍️ Redação enviada para correção',
          heading: 'Um aluno enviou uma redação',
          message: 'Há uma redação aguardando a sua correção no painel.',
          ctaLabel: 'Corrigir agora', path: '/login' };
      }
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], cat: 'redacao', subject: '✍️ Novo tema de redação',
        heading: 'Você recebeu um novo tema de redação',
        message: (rec.title ? '“' + rec.title + '”. ' : '') + 'Escreva sua resposta no painel quando quiser.',
        ctaLabel: 'Escrever redação', path: '/login' };
    case 'pronunciation':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], cat: 'pronuncia', subject: '🎙️ Nova prática de pronúncia',
        heading: 'Você recebeu uma prática de pronúncia',
        message: 'Pratique a palavra enviada pelo seu professor e melhore seu speaking.',
        ctaLabel: 'Praticar agora', path: '/login' };
    case 'vocabulary_words':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], cat: 'vocab', subject: '📚 Novo vocabulário para estudar',
        heading: 'Novas palavras de vocabulário',
        message: 'Seu professor adicionou novas palavras para você estudar. Vamos expandir seu vocabulário!',
        ctaLabel: 'Estudar agora', path: '/login' };
    case 'coord_messages':
      if (!rec.teacher_id) return null;
      return { userIds: [rec.teacher_id], cat: 'mensagem', subject: '📨 Mensagem da coordenação',
        heading: 'Você tem uma mensagem da coordenação',
        message: rec.title || 'A coordenação enviou uma nova mensagem para você. Confira no painel.',
        ctaLabel: 'Ver mensagem', path: '/login' };
    case 'announcements':
      return { roles: [rec.target_role || 'student'], cat: 'aviso', subject: '📢 ' + (rec.title || 'Novo aviso'),
        heading: rec.title || 'Novo comunicado da EA',
        message: rec.content || rec.title || 'Há um novo aviso publicado no seu painel.',
        ctaLabel: 'Ver aviso', path: '/login' };
    case 'placement_tests':
      return { roles: ['coordinator'], cat: 'nivel', subject: '🎯 Nova solicitação de nivelamento',
        heading: 'Nova solicitação de nivelamento',
        message: (rec.full_name ? rec.full_name + ' ' : 'Um novo lead ') + 'solicitou uma aula experimental. Confira os detalhes no painel.',
        ctaLabel: 'Ver solicitação', path: '/login' };
    case 'help_requests': {
      // Professor respondeu → e-mail para o ALUNO
      if (rec.status === 'answered' && rec.answer) {
        if (old && old.status === 'answered') return null;       // não reenviar (ex.: marcar como lido)
        if (!rec.student_id) return null;
        return { userIds: [rec.student_id], cat: 'pergunta', subject: '💬 Resposta do seu professor',
          heading: 'Seu professor respondeu sua pergunta',
          message: (rec.subject ? '“' + rec.subject + '”. ' : '') + 'A resposta já está disponível no seu painel.',
          ctaLabel: 'Ver resposta', path: '/login' };
      }
      // Nova pergunta (INSERT) → e-mail para o PROFESSOR
      if (old) return null;                                       // updates que não são resposta não enviam
      if (!rec.teacher_id) return null;
      return { userIds: [rec.teacher_id], cat: 'pergunta', subject: '❓ Nova pergunta de aluno',
        heading: 'Um aluno enviou uma pergunta',
        message: (rec.subject ? '“' + rec.subject + '”. ' : '') + 'Há uma nova pergunta aguardando a sua resposta no painel.',
        ctaLabel: 'Responder', path: '/login' };
    }
    default:
      return null;
  }
}

function template(p, name) {
  const cat = CATS[p.cat] || CATS.geral;
  const cta = SITE_URL + (p.path || '/login');
  const hi = name ? ('Olá, ' + firstName(name) + '! ') : '';
  const year = new Date().getFullYear();
  const host = SITE_URL.replace(/^https?:\/\//, '');

  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '</head>' +
    '<body style="margin:0;padding:0;background:#eef1f7;-webkit-text-size-adjust:100%;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#eef1f7">' + esc(p.heading) + '</div>' +
    '<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">' + '&zwnj;&nbsp;'.repeat(70) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f7"><tr><td align="center" style="padding:30px 14px">' +

    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6e9f1">' +

    // Cabeçalho com logo
    '<tr><td bgcolor="' + C.navy + '" style="background:#19244e;background-image:linear-gradient(135deg,#19244e 0%,#253c96 100%);padding:30px 28px 24px;text-align:center">' +
      '<img src="' + esc(LOGO) + '" width="66" height="66" alt="EA English Classes" style="display:inline-block;width:66px;height:66px;border-radius:16px;background:#ffffff;border:3px solid rgba(255,255,255,.92)">' +
      '<div style="margin-top:12px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.01em">EA <span style="color:#f59a1e">English Classes</span></div>' +
    '</td></tr>' +

    // Faixa de cor da categoria
    '<tr><td bgcolor="' + cat.color + '" style="background:' + cat.color + ';height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>' +

    // Corpo
    '<tr><td style="padding:30px 34px 36px">' +
      // chip da categoria
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>' +
        '<td bgcolor="' + cat.color + '" style="background:' + cat.color + ';border-radius:999px;padding:6px 14px;color:' + cat.text + ';font-size:12px;font-weight:800;letter-spacing:.02em">' + cat.emoji + ' ' + esc(cat.label) + '</td>' +
      '</tr></table>' +
      '<h1 style="margin:0 0 12px;color:#19244e;font-size:23px;line-height:1.3;font-weight:800">' + esc(p.heading) + '</h1>' +
      '<p style="margin:0 0 28px;color:#48526b;font-size:15px;line-height:1.7">' + hi + esc(p.message) + '</p>' +
      // botão de ação (bulletproof)
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td align="center" bgcolor="' + cat.color + '" style="background:' + cat.color + ';border-radius:12px">' +
          '<a href="' + esc(cta) + '" target="_blank" style="display:inline-block;padding:15px 32px;color:' + cat.text + ';text-decoration:none;font-weight:800;font-size:15px;border-radius:12px">' + esc(p.ctaLabel || 'Abrir o app') + ' &rarr;</a>' +
        '</td>' +
      '</tr></table>' +
    '</td></tr>' +

    // Rodapé institucional
    '<tr><td style="padding:24px 34px;background:#f7f8fb;border-top:1px solid #eceef3">' +
      '<div style="color:#19244e;font-size:14px;font-weight:800;margin-bottom:4px">EA English Classes</div>' +
      '<div style="color:#7c8499;font-size:12px;line-height:1.7">' +
        'Escola de inglês online · São Paulo, SP — Brasil<br>' +
        '<a href="' + esc(SITE_URL) + '" target="_blank" style="color:#253c96;text-decoration:none;font-weight:600">' + esc(host) + '</a>' +
        ' &nbsp;·&nbsp; <a href="https://www.instagram.com/contatoea" target="_blank" style="color:#253c96;text-decoration:none;font-weight:600">@contatoea</a>' +
      '</div>' +
    '</td></tr>' +
    '</table>' +

    '<div style="color:#aeb4c2;font-size:11px;line-height:1.6;padding:16px 8px 0;max-width:600px">' +
      'Você recebeu este e-mail porque tem uma conta na EA English Classes.<br>© ' + year + ' EA English Classes · Todos os direitos reservados.' +
    '</div>' +

    '</td></tr></table></body></html>';
}

async function sendEmail(to, subject, html) {
  const payload = { from: FROM, to: [to], subject, html };
  if (REPLY_TO) payload.reply_to = REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (r.ok) return { ok: true };
  let detail = ''; try { detail = await r.text(); } catch (e) {}
  return { ok: false, status: r.status, detail };
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
    if (!SB_URL || !SB_KEY || !RESEND_KEY) {
      res.status(500).json({ error: 'missing env',
        envPresent: { SUPABASE_URL: !!SB_URL, SUPABASE_SERVICE_ROLE_KEY: !!SB_KEY, RESEND_API_KEY: !!RESEND_KEY } });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    // Teste: { test:true, to:"voce@exemplo.com", cat?:"feedback" }
    if (body.test && body.to) {
      const tp = { cat: body.cat || 'geral', heading: 'Teste de e-mail',
        message: 'Se você recebeu isto, o envio de e-mails está funcionando perfeitamente.',
        ctaLabel: 'Abrir o app', path: '/login' };
      const out = await sendEmail(body.to, body.subject || '✉️ Teste — EA English Classes', template(tp, body.name));
      res.status(out.ok ? 200 : 500).json({ test: true, sent: out.ok, error: out.ok ? undefined : out });
      return;
    }

    const table = body.table || null;
    const rec = body.record || body.new || {};
    const old = body.old_record || body.old || null;
    if (!table || !rec) { res.status(200).json({ skipped: 'no record' }); return; }

    const p = await plan(table, rec, old);
    if (!p) { res.status(200).json({ skipped: 'no mapping' }); return; }

    let recipients = [];
    if (p.userIds) recipients = await emailsForUsers(p.userIds);
    else if (p.roles) recipients = await emailsForRoles(p.roles);
    if (!recipients.length) { res.status(200).json({ skipped: 'no recipient email' }); return; }

    let sent = 0; const errors = [];
    // Assunto único por envio: evita que o Gmail agrupe e-mails diferentes
    // na mesma conversa (thread). Mantém o assunto original de plan() intacto.
    const finalSubject = (rec && rec.id)
      ? `EA • ${p.subject} • ${String(rec.id).slice(0, 6).toUpperCase()}`
      : p.subject;
    await Promise.all(recipients.map(async (rcpt) => {
      const html = template(p, rcpt.name);   // personalizado pelo nome
      const out = await sendEmail(rcpt.email, finalSubject, html);
      if (out.ok) sent++; else errors.push(out.status || 'err');
    }));

    res.status(200).json({ ok: true, table, cat: p.cat, sent, candidates: recipients.length, errors });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: String((e && e.stack) || e) });
  }
}
