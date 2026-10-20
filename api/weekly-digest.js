// Resumo semanal do aluno — "Sua semana na WIN".
// Toda segunda de manhã (cron da Vercel em vercel.json) cada aluno ativo recebe
// UM e-mail com: aulas da semana, o que está pendente e o que chegou de novo.
// Só envia se houver algo útil. O aluno pode desligar com 1 clique no próprio e-mail.
//
// Variáveis (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// EA_PUSH_SECRET (testes manuais), CRON_SECRET (a Vercel envia sozinha no cron).
// Opcional: EMAIL_FROM, EMAIL_REPLY_TO, DIGEST_SECRET (assina os links de descadastro).
//
// Uso manual (no navegador):
//   /api/weekly-digest?secret=SEGREDO&preview=aluno@email.com   → mostra o e-mail sem enviar
//   /api/weekly-digest?secret=SEGREDO&test=aluno@email.com      → envia só para esse aluno
//   /api/weekly-digest?secret=SEGREDO&run=1                     → envia para todos (igual ao cron)

const crypto = require('crypto');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'WIN <avisos@winenglish.com.br>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'contatowincord@gmail.com';
const SITE = 'https://www.winenglish.com.br';
const LOGO = SITE + '/icons/Logo_WIN.jpg';
const SIGN_KEY = process.env.DIGEST_SECRET || SB_KEY || 'win';
const C = { navy: '#0B1F33', red: '#D71920', steel: '#6F8FA8', ink: '#48526b', mute: '#7c8499', line: '#eceef3', soft: '#f7f8fb' };
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']; // schedule_slots: seg=0 … dom=6

// ── utilidades ──
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = s => String(s || '').trim().toLowerCase();
const first = n => esc(String(n || '').trim().split(/\s+/)[0] || '');
const sign = id => crypto.createHmac('sha256', SIGN_KEY).update('digest:' + id).digest('hex').slice(0, 32);
const okSig = (id, sig) => { try { return crypto.timingSafeEqual(Buffer.from(sign(id)), Buffer.from(String(sig || ''))); } catch (e) { return false; } };

async function sb(path, opts) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, Object.assign({
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  }, opts || {}));
  if (!r.ok) throw new Error('Supabase ' + r.status + ' em ' + path.split('?')[0] + ': ' + (await r.text()).slice(0, 200));
  return r.status === 204 ? null : r.json();
}

// Data de hoje em São Paulo (YYYY-MM-DD) e a segunda-feira desta semana
function semanaSP() {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dow = (hoje.getDay() + 6) % 7; // seg=0
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - dow);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { ini: iso(seg), fim: iso(dom), rotulo: seg.getDate() + '/' + (seg.getMonth() + 1) + ' a ' + dom.getDate() + '/' + (dom.getMonth() + 1) };
}

function fmtPrazo(d) {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? ' · até ' + p[2] + '/' + p[1] : '';
}

// ── coleta tudo de uma vez (poucas consultas, qualquer número de alunos) ──
async function coletar(filtroEmail) {
  let q = 'profiles?role=eq.student&active=eq.true&archived_at=is.null&select=id,full_name,email,weekly_digest';
  if (filtroEmail) q += '&email=eq.' + encodeURIComponent(filtroEmail);
  else q += '&weekly_digest=eq.true';
  const alunos = (await sb(q)).filter(a => a.email);
  if (!alunos.length) return [];

  const ids = alunos.map(a => a.id).join(',');
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const sem = semanaSP();

  const [enr, staff, hw, wrPend, wrCorr, fb, voc, pron] = await Promise.all([
    sb(`enrollments?active=eq.true&student_id=in.(${ids})&select=student_id,teacher_id`),
    sb('profiles?role=in.(teacher,coordinator)&select=id,full_name'),
    sb(`task_submissions?status=eq.pending&student_id=in.(${ids})&select=student_id,tasks(title,due_date,cancelled)`),
    sb(`writing_activities?status=eq.pending&student_id=in.(${ids})&select=student_id,title,due_date`),
    sb(`writing_activities?status=eq.graded&seen_at=is.null&reviewed_at=gte.${desde}&student_id=in.(${ids})&select=student_id,title`),
    sb(`feedbacks?cancelled=eq.false&seen_at=is.null&created_at=gte.${desde}&student_id=in.(${ids})&select=student_id,title`),
    sb(`vocabulary_words?seen_at=is.null&created_at=gte.${desde}&student_id=in.(${ids})&select=student_id`),
    sb(`pronunciation?seen_at=is.null&practiced=eq.false&created_at=gte.${desde}&student_id=in.(${ids})&select=student_id`)
  ]);

  const teacherIds = Array.from(new Set(enr.map(e => e.teacher_id).filter(Boolean)));
  const [slots, evts] = teacherIds.length ? await Promise.all([
    sb(`schedule_slots?teacher_id=in.(${teacherIds.join(',')})&select=id,teacher_id,day_of_week,time_slot,duration_minutes,student_id,student_name`),
    sb(`schedule_events?teacher_id=in.(${teacherIds.join(',')})&event_date=gte.${sem.ini}&event_date=lte.${sem.fim}&select=slot_id,event_type`)
  ]) : [[], []];

  const nome = {}; staff.forEach(p => { nome[p.id] = p.full_name; });
  const alterados = new Set(evts.filter(e => e.slot_id).map(e => e.slot_id));
  const por = (lista, id) => lista.filter(r => r.student_id === id);

  return alunos.map(a => {
    const meusProfs = enr.filter(e => e.student_id === a.id).map(e => e.teacher_id);
    const aulas = slots
      .filter(s => meusProfs.includes(s.teacher_id) && (s.student_id === a.id || norm(s.student_name) === norm(a.full_name)))
      .sort((x, y) => x.day_of_week - y.day_of_week || String(x.time_slot).localeCompare(String(y.time_slot)))
      .map(s => ({
        dia: DIAS[s.day_of_week] || '', hora: String(s.time_slot || '').slice(0, 5),
        prof: (nome[s.teacher_id] || '').split(/\s+/)[0], mudou: alterados.has(s.id)
      }));
    return {
      aluno: a, semana: sem.rotulo, aulas,
      homework: por(hw, a.id).filter(r => r.tasks && !r.tasks.cancelled).map(r => ({ t: r.tasks.title, prazo: r.tasks.due_date })),
      redacoes: por(wrPend, a.id).map(r => ({ t: r.title, prazo: r.due_date })),
      corrigidas: por(wrCorr, a.id).map(r => r.title),
      feedbacks: por(fb, a.id).map(r => r.title),
      vocab: por(voc, a.id).length,
      pronuncia: por(pron, a.id).length
    };
  });
}

const temConteudo = d => d.aulas.length || d.homework.length || d.redacoes.length || d.corrigidas.length || d.feedbacks.length || d.vocab || d.pronuncia;

// ── e-mail ──
function bloco(titulo, linhas, link, rotuloLink) {
  if (!linhas.length) return '';
  return '<tr><td style="padding:0 34px 22px">' +
    '<div style="color:' + C.navy + ';font-size:14px;font-weight:800;margin:0 0 8px">' + titulo + '</div>' +
    linhas.map(l => '<div style="color:' + C.ink + ';font-size:14px;line-height:1.6;padding:7px 0;border-bottom:1px solid ' + C.line + '">' + l + '</div>').join('') +
    (link ? '<div style="margin-top:8px"><a href="' + SITE + '/login?ir=' + link + '" style="color:' + C.red + ';font-size:13px;font-weight:700;text-decoration:none">' + rotuloLink + ' &rarr;</a></div>' : '') +
    '</td></tr>';
}

function montar(d) {
  const a = d.aluno;
  const unsub = SITE + '/api/weekly-digest?unsub=' + a.id + '.' + sign(a.id);
  const pend = d.homework.length + d.redacoes.length;
  const resumo = pend
    ? 'Você tem ' + pend + (pend === 1 ? ' atividade pendente' : ' atividades pendentes') + ' para esta semana.'
    : 'Nada pendente por aqui. Aproveite para revisar o que chegou de novo.';

  const novidades = [];
  d.corrigidas.forEach(t => novidades.push('✅ Redação corrigida: ' + esc(t || 'sem título')));
  d.feedbacks.forEach(t => novidades.push('📝 Feedback do professor' + (t ? ': ' + esc(t) : '')));
  if (d.vocab) novidades.push('📚 ' + d.vocab + (d.vocab === 1 ? ' palavra nova' : ' palavras novas') + ' no seu vocabulário');
  if (d.pronuncia) novidades.push('🎙️ ' + d.pronuncia + (d.pronuncia === 1 ? ' prática de pronúncia' : ' práticas de pronúncia'));

  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>' +
    '<body style="margin:0;padding:0;background:#eef1f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:#eef1f7">' + esc(resumo) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7"><tr><td align="center" style="padding:30px 14px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e6e9f1">' +
    '<tr><td bgcolor="' + C.navy + '" style="background:' + C.navy + ';padding:28px;text-align:center">' +
      '<img src="' + LOGO + '" width="60" height="60" alt="WIN" style="display:inline-block;width:60px;height:60px;border-radius:14px;background:#fff;border:3px solid rgba(255,255,255,.92)">' +
      '<div style="margin-top:10px;color:#fff;font-size:17px;font-weight:800">Sua semana na WIN</div>' +
      '<div style="color:' + C.steel + ';font-size:13px;margin-top:2px">' + esc(d.semana) + '</div></td></tr>' +
    '<tr><td bgcolor="' + C.red + '" style="background:' + C.red + ';height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 34px 20px"><p style="margin:0;color:' + C.ink + ';font-size:15px;line-height:1.7">Olá, ' + first(a.full_name) + '! ' + esc(resumo) + '</p></td></tr>' +
    bloco('🗓️ Suas aulas', d.aulas.map(x => '<b style="color:' + C.navy + '">' + esc(x.dia) + ', ' + esc(x.hora) + '</b>' + (x.prof ? ' · com ' + esc(x.prof) : '') + (x.mudou ? ' <span style="color:' + C.red + '">· há alteração nesta semana</span>' : '')), 'overview', 'Ver no painel') +
    bloco('📚 Homework pendente', d.homework.map(x => esc(x.t || 'Atividade') + '<span style="color:' + C.mute + '">' + fmtPrazo(x.prazo) + '</span>'), 'homework', 'Abrir homework') +
    bloco('✍️ Redação para escrever', d.redacoes.map(x => esc(x.t || 'Redação') + '<span style="color:' + C.mute + '">' + fmtPrazo(x.prazo) + '</span>'), 'writing', 'Escrever agora') +
    bloco('✨ Chegou para você', novidades, 'feedback', 'Ver no painel') +
    '<tr><td align="center" style="padding:6px 34px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="' + C.red + '" style="background:' + C.red + ';border-radius:12px">' +
      '<a href="' + SITE + '/login" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-weight:800;font-size:15px">Abrir meu painel &rarr;</a></td></tr></table></td></tr>' +
    '<tr><td style="padding:20px 34px;background:' + C.soft + ';border-top:1px solid ' + C.line + ';color:' + C.mute + ';font-size:12px;line-height:1.7">' +
      '<b style="color:' + C.navy + '">WIN</b> · English is just the beginning<br>' +
      'Você recebe este resumo às segundas porque é aluno(a) da WIN. <a href="' + unsub + '" style="color:' + C.mute + '">Não quero mais receber</a>.</td></tr>' +
    '</table></td></tr></table></body></html>';

  const txt = 'Sua semana na WIN (' + d.semana + ')\n\nOlá, ' + String(a.full_name || '').split(' ')[0] + '! ' + resumo + '\n\n' +
    (d.aulas.length ? 'Aulas: ' + d.aulas.map(x => x.dia + ' ' + x.hora).join(' · ') + '\n' : '') +
    (d.homework.length ? 'Homework: ' + d.homework.map(x => x.t).join(' · ') + '\n' : '') +
    (d.redacoes.length ? 'Redação: ' + d.redacoes.map(x => x.t).join(' · ') + '\n' : '') +
    '\nAbrir painel: ' + SITE + '/login\nNão quero mais receber: ' + unsub;

  return {
    from: FROM, to: [a.email], reply_to: REPLY_TO,
    subject: pend ? '🗓️ Sua semana na WIN · ' + pend + (pend === 1 ? ' pendência' : ' pendências') : '🗓️ Sua semana na WIN',
    html, text: txt,
    headers: { 'List-Unsubscribe': '<' + unsub + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  };
}

async function enviarLote(msgs) {
  let enviados = 0; const erros = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(msgs.slice(i, i + 100))
    });
    if (r.ok) enviados += msgs.slice(i, i + 100).length;
    else erros.push(r.status + ' ' + (await r.text()).slice(0, 300));
  }
  return { enviados, erros };
}

function pagina(titulo, texto, link) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(titulo) + ' · WIN</title></head>' +
    '<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#eef1f7;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">' +
    '<div style="background:#fff;max-width:440px;border-radius:18px;padding:32px;text-align:center;border:1px solid #e6e9f1">' +
    '<img src="' + LOGO + '" width="56" height="56" alt="WIN" style="border-radius:12px"><h1 style="color:' + C.navy + ';font-size:20px">' + esc(titulo) + '</h1>' +
    '<p style="color:' + C.ink + ';line-height:1.6">' + texto + '</p>' + (link || '') + '</div></body></html>';
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};

    // ── descadastro / recadastro com 1 clique (sem login) ──
    const tok = q.unsub || q.resub || (req.method === 'POST' && q.unsub);
    if (tok) {
      const [id, sig] = String(tok).split('.');
      if (!/^[0-9a-f-]{36}$/.test(id || '') || !okSig(id, sig)) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(pagina('Link inválido', 'Este link não é válido. Se quiser ajustar seus e-mails, responda qualquer mensagem da WIN.'));
      }
      const ligar = !!q.resub;
      await sb(`profiles?id=eq.${id}&role=eq.student`, { method: 'PATCH', body: JSON.stringify({ weekly_digest: ligar }), headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(ligar
        ? pagina('Resumo reativado', 'Você volta a receber o resumo da semana às segundas.')
        : pagina('Pronto, resumo desligado', 'Você não vai mais receber o resumo semanal. Os avisos de homework, feedback e correções continuam normais.',
            '<a href="' + SITE + '/api/weekly-digest?resub=' + id + '.' + sign(id) + '" style="color:' + C.red + ';font-weight:700;text-decoration:none">Mudei de ideia, quero receber</a>'));
    }

    // ── execuções autorizadas ──
    const auth = req.headers['authorization'] || '';
    const isCron = !!process.env.CRON_SECRET && auth === 'Bearer ' + process.env.CRON_SECRET;
    const isManual = !!process.env.EA_PUSH_SECRET && (q.secret === process.env.EA_PUSH_SECRET || req.headers['x-ea-secret'] === process.env.EA_PUSH_SECRET);
    if (!isCron && !isManual) return res.status(401).json({ error: 'unauthorized' });
    if (!SB_URL || !SB_KEY || !RESEND_KEY) return res.status(500).json({ error: 'missing env' });

    if (q.preview) {
      const [d] = await coletar(String(q.preview));
      if (!d) return res.status(404).json({ error: 'aluno não encontrado ou inativo' });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(montar(d).html);
    }

    const lista = await coletar(q.test ? String(q.test) : null);
    const comAlgo = lista.filter(temConteudo);
    if (!isCron && !q.test && !q.run) return res.status(200).json({ alunos: lista.length, comConteudo: comAlgo.length, dica: 'use ?preview=email, ?test=email ou ?run=1' });
    const out = await enviarLote(comAlgo.map(montar));
    return res.status(out.erros.length ? 207 : 200).json({ alunos: lista.length, enviados: out.enviados, semConteudo: lista.length - comAlgo.length, erros: out.erros });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
