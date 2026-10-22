// Utilitários de segurança compartilhados pelas funções em /api.
// Arquivos com "_" no início NÃO viram rotas na Vercel; este só é importado.
//
// Usa as variáveis já configuradas na Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (obrigatórias)
//   SUPABASE_ANON_KEY (opcional; se ausente, usa a service role só como apikey)
// Nenhum segredo é devolvido ao navegador nem impresso nos logs.

const ALLOWED_ORIGINS = [
  'https://www.winenglish.com.br',
  'https://winenglish.com.br',
];
// Pré-visualizações deste projeto na Vercel
const PREVIEW_RE = /^https:\/\/maicondeividbs-lgtm-eaenglishclasses[a-z0-9-]*\.vercel\.app$/i;

export function originAllowed(origin) {
  if (!origin) return true; // mesma origem sem cabeçalho Origin (ex.: navegação direta)
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_RE.test(origin);
}

// Aplica CORS restrito. Retorna false (e já responde 403) se a origem não for permitida.
export function applyCors(req, res, methods) {
  const origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  if (origin && originAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods || 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (!originAllowed(origin)) {
    res.status(403).json({ error: 'Origem não permitida.' });
    return false;
  }
  return true;
}

export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Valida o JWT do Supabase enviado em "Authorization: Bearer <token>" e
// carrega o perfil. Recusa contas inativas/arquivadas e papéis não permitidos.
export async function requireUser(req, allowedRoles) {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new AuthError(500, 'Servidor sem configuração de autenticação.');

  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]{20,})$/);
  if (!m) throw new AuthError(401, 'Faça login para usar este recurso.');
  const token = m[1];

  const apikey = process.env.SUPABASE_ANON_KEY || service;
  const ur = await fetch(url + '/auth/v1/user', {
    headers: { apikey, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000),
  });
  if (!ur.ok) throw new AuthError(401, 'Sessão inválida ou expirada. Entre novamente.');
  const user = await ur.json();
  if (!user || !user.id) throw new AuthError(401, 'Sessão inválida.');

  const pr = await fetch(url + '/rest/v1/profiles?select=id,role,active,archived_at&id=eq.' + encodeURIComponent(user.id), {
    headers: { apikey: service, Authorization: 'Bearer ' + service, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!pr.ok) throw new AuthError(503, 'Não foi possível verificar o perfil.');
  const rows = await pr.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) throw new AuthError(403, 'Perfil não encontrado.');
  if (profile.active === false || profile.archived_at) throw new AuthError(403, 'Conta inativa.');
  if (allowedRoles && !allowedRoles.includes(profile.role)) throw new AuthError(403, 'Você não tem permissão para este recurso.');
  return { user, profile };
}

// Limite simples por usuário, em memória da instância (melhor esforço:
// cada instância serverless tem sua própria contagem).
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) { buckets.set(key, { start: now, n: 1 }); return true; }
  b.n += 1;
  if (buckets.size > 5000) buckets.clear();
  return b.n <= max;
}

export function readJsonBody(req, maxBytes) {
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > maxBytes) throw new AuthError(413, 'Requisição grande demais.');
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  } else if (body && JSON.stringify(body).length > maxBytes) {
    throw new AuthError(413, 'Requisição grande demais.');
  }
  return body || {};
}
