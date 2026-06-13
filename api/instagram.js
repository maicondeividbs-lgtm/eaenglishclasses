// Função serverless da Vercel — retorna as publicações mais recentes do
// Instagram da EA para exibir no site (index.html → seção "Instagram").
//
// Usa a API OFICIAL atual: "Instagram API with Instagram Login" (Graph API),
// que substituiu a Basic Display API (descontinuada em 04/12/2024). Exige uma
// conta PROFISSIONAL (Business ou Creator) e um token de longa duração (~60 dias).
//
// Variáveis de ambiente (painel da Vercel → Settings → Environment Variables):
//   IG_ACCESS_TOKEN   token de acesso de longa duração do Instagram (SEGREDO)
//   IG_LIMIT          (opcional) quantas publicações buscar — padrão 9
//   EA_PUSH_SECRET    (opcional) o mesmo segredo já usado no push; protege o
//                     endpoint de renovação do token (?refresh=1&secret=...)
//
// NUNCA versionar o token. Ele fica só na Vercel.
//
// Endpoints:
//   GET /api/instagram            → { configured, posts: [...] }  (cacheado na CDN)
//   GET /api/instagram?refresh=1&secret=EA_PUSH_SECRET
//                                 → renova e devolve um novo token de 60 dias
//                                   (copie o novo valor para IG_ACCESS_TOKEN)

const GRAPH = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const token = process.env.IG_ACCESS_TOKEN;

  // ── Renovação do token de longa duração (uso manual a cada ~60 dias) ──
  if (req.query && req.query.refresh) {
    const secret = process.env.EA_PUSH_SECRET;
    if (!secret || req.query.secret !== secret) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!token) return res.status(400).json({ error: 'no_token_set' });
    try {
      const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'refresh_failed', detail: data });
      // Atenção: copie 'access_token' abaixo para a variável IG_ACCESS_TOKEN na Vercel.
      return res.status(200).json(data);
    } catch (e) {
      return res.status(502).json({ error: 'refresh_error', detail: String(e) });
    }
  }

  // ── Sem token configurado: resposta graciosa (o site mostra só o CTA) ──
  if (!token) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ configured: false, posts: [] });
  }

  const limit = Math.min(parseInt(process.env.IG_LIMIT || '9', 10) || 9, 25);

  try {
    const url = `${GRAPH}/me/media?fields=${FIELDS}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok) {
      // token expirado/ inválido → não derruba o site
      res.setHeader('Cache-Control', 'public, s-maxage=120');
      return res.status(200).json({ configured: true, error: 'fetch_failed', detail: data, posts: [] });
    }

    const posts = (data.data || []).map((p) => ({
      id: p.id,
      type: p.media_type,                                  // IMAGE | VIDEO | CAROUSEL_ALBUM
      image: p.media_type === 'VIDEO' ? (p.thumbnail_url || p.media_url) : p.media_url,
      caption: p.caption || '',
      permalink: p.permalink,
      timestamp: p.timestamp
    }));

    // Cache na CDN da Vercel: atualiza sozinho ~de hora em hora, sem
    // bater no Instagram a cada visita. stale-while-revalidate por 1 dia.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ configured: true, posts });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).json({ configured: true, error: 'exception', detail: String(e), posts: [] });
  }
}
