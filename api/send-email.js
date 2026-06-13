// Função serverless da Vercel — envia e-mail (Resend) para o destinatário certo.
// Acionada por um Database Webhook do Supabase (INSERT/UPDATE nas tabelas de
// notificação) ou por chamada de teste autenticada.
//
// Variáveis de ambiente necessárias (painel da Vercel → Settings → Environment Variables):
//   SUPABASE_URL                 ex.: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    (segredo do Supabase — Project Settings > API)
//   RESEND_API_KEY               (segredo do Resend — começa com "re_")
//   EA_PUSH_SECRET               o MESMO segredo já usado no push (o webhook envia junto)
// Opcionais:
//   EMAIL_FROM       remetente verificado. Padrão: EA English Classes <avisos@eaenglishclasses.com.br>
//   EMAIL_REPLY_TO   endereço de resposta (ex.: eaenglished@gmail.com)
//   SITE_URL         base dos links do e-mail. Padrão: https://www.eaenglishclasses.com.br

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'EA English Classes <avisos@eaenglishclasses.com.br>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || '';
const SITE_URL = (process.env.SITE_URL || 'https://www.eaenglishclasses.com.br').replace(/\/+$/, '');
const LOGO = process.env.EMAIL_LOGO_URL || (SITE_URL + '/icons/Logo_EA.jpg');

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

// Descobre e-mails a partir de ids de usuário (tabela profiles).
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

// Decide destinatário + conteúdo a partir da linha alterada.
// Retorna { userIds?, roles?, subject, heading, message, ctaLabel } ou null.
async function plan(table, rec, old) {
  switch (table) {
    case 'task_submissions': {
      // Aluno entregou (status saiu de "pending") → avisa o professor
      const delivered = rec.status && rec.status !== 'pending' && (!old || old.status !== rec.status);
      if (delivered) {
        const t = await lookupTask(rec.task_id);
        if (t && t.teacher_id) {
          return { userIds: [t.teacher_id], subject: '📬 Homework entregue', heading: 'Um aluno entregou um homework',
            message: 'A tarefa “' + (t.title || 'homework') + '” foi marcada como entregue.', ctaLabel: 'Ver no painel' };
        }
        return null;
      }
      // Homework novo (INSERT) → avisa o aluno
      if (rec.student_id) {
        return { userIds: [rec.student_id], subject: '📝 Novo homework', heading: 'Você recebeu um novo homework',
          message: 'Há uma nova tarefa esperando por você no painel.', ctaLabel: 'Abrir homework' };
      }
      return null;
    }
    case 'feedbacks':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], subject: '💬 Novo feedback', heading: 'Seu professor deixou um feedback',
        message: (rec.title ? '“' + rec.title + '”. ' : '') + 'Confira no seu painel.', ctaLabel: 'Ver feedback' };
    case 'writing_activities':
      if (rec.status === 'graded') {
        if (!rec.student_id) return null;
        return { userIds: [rec.student_id], subject: '✅ Redação corrigida', heading: 'Sua redação foi corrigida',
          message: (rec.title ? '“' + rec.title + '” ' : 'Sua redação ') + 'recebeu comentários e nota.', ctaLabel: 'Ver correção' };
      }
      if (rec.status === 'submitted') {
        if (!rec.teacher_id) return null;
        return { userIds: [rec.teacher_id], subject: '✍️ Redação enviada para correção', heading: 'Um aluno enviou uma redação',
          message: 'Há uma redação aguardando a sua correção.', ctaLabel: 'Corrigir agora' };
      }
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], subject: '✍️ Novo tema de redação', heading: 'Você recebeu um tema de redação',
        message: (rec.title ? '“' + rec.title + '”. ' : '') + 'Escreva sua resposta no painel.', ctaLabel: 'Escrever redação' };
    case 'pronunciation':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], subject: '🎙️ Nova prática de pronúncia', heading: 'Você recebeu uma prática de pronúncia',
        message: 'Pratique a palavra enviada pelo seu professor.', ctaLabel: 'Praticar' };
    case 'vocabulary_words':
      if (!rec.student_id) return null;
      return { userIds: [rec.student_id], subject: '📚 Novo vocabulário', heading: 'Novas palavras de vocabulário',
        message: 'Seu professor adicionou vocabulário para você estudar.', ctaLabel: 'Estudar' };
    case 'coord_messages':
      if (!rec.teacher_id) return null;
      return { userIds: [rec.teacher_id], subject: '📨 Mensagem da coordenação', heading: 'Mensagem da coordenação',
        message: rec.title || 'Você tem uma nova mensagem da coordenação.', ctaLabel: 'Ver mensagem' };
    case 'announcements':
      return { roles: [rec.target_role || 'student'], subject: '📢 Novo aviso', heading: 'Novo comunicado da EA',
        message: rec.title || 'Há um novo aviso no painel.', ctaLabel: 'Ver aviso' };
    case 'placement_tests':
      return { roles: ['coordinator'], subject: '🎯 Novo nivelamento', heading: 'Nova solicitação de nivelamento',
        message: (rec.full_name ? rec.full_name + ' ' : '') + 'solicitou uma aula experimental.', ctaLabel: 'Ver no painel' };
    default:
      return null;
  }
}

function template(p) {
  const cta = SITE_URL + '/login.html';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(p.heading) + ' \u2014 EA English Classes</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:32px 14px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(25,36,78,.10)">' +
    '<tr><td style="background:#19244e;background-image:linear-gradient(135deg,#19244e 0%,#253c96 100%);padding:30px 28px 26px;text-align:center">' +
      '<img src="' + esc(LOGO) + '" width="68" height="68" alt="EA English Classes" style="display:inline-block;width:68px;height:68px;border-radius:18px;background:#fff;border:3px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(0,0,0,.18)">' +
      '<div style="margin-top:12px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.01em">EA <span style="color:#f59a1e">English Classes</span></div>' +
    '</td></tr>' +
    '<tr><td style="height:4px;background:#f36b2e;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:30px 32px 34px">' +
      '<h1 style="margin:0 0 12px;color:#19244e;font-size:22px;line-height:1.3;font-weight:800">' + esc(p.heading) + '</h1>' +
      '<p style="margin:0 0 26px;color:#48526b;font-size:15px;line-height:1.7">' + esc(p.message) + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#f36b2e;box-shadow:0 6px 16px rgba(243,107,46,.30)">' +
        '<a href="' + esc(cta) + '" style="display:inline-block;padding:15px 30px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">' + esc(p.ctaLabel || 'Abrir o app') + '</a>' +
      '</td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 32px;background:#f7f8fb;border-top:1px solid #eceef3;color:#9099ab;font-size:12px;line-height:1.6">' +
      'Voc\u00ea recebeu este e-mail porque tem uma conta na EA English Classes.<br>' +
      '<a href="' + esc(SITE_URL) + '" style="color:#253c96;text-decoration:none;font-weight:600">' + esc(SITE_URL.replace(/^https?:\/\//, '')) + '</a>' +
    '</td></tr>' +
    '</table>' +
    '<div style="color:#aeb4c2;font-size:11px;padding:16px 0 0">EA English Classes \u00b7 Osasco/SP</div>' +
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
    const envOk = { SUPABASE_URL: !!SB_URL, SUPABASE_SERVICE_ROLE_KEY: !!SB_KEY, RESEND_API_KEY: !!RESEND_KEY };
    if (!SB_URL || !SB_KEY || !RESEND_KEY) {
      res.status(500).json({ error: 'missing env', envPresent: envOk }); return;
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    // Modo de teste: { test:true, to:"voce@exemplo.com" }
    if (body.test && body.to) {
      const out = await sendEmail(body.to, body.subject || '✉️ Teste EA English Classes',
        template({ heading: 'Teste de e-mail', message: 'Se você recebeu isto, o envio de e-mails está funcionando.', ctaLabel: 'Abrir o app' }));
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

    const html = template(p);
    let sent = 0; const errors = [];
    await Promise.all(recipients.map(async (rcpt) => {
      const out = await sendEmail(rcpt.email, p.subject, html);
      if (out.ok) sent++; else errors.push(out.status || 'err');
    }));

    res.status(200).json({ ok: true, table, sent, candidates: recipients.length, errors });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: String((e && e.stack) || e) });
  }
}
