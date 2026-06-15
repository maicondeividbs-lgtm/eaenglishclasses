// Função serverless da Vercel — retorna as publicações recentes do Instagram
// da EA para o site (index.html → seção "Instagram").
//
// ► VERSÃO SEM APP NA META (acessível no Brasil)
// Em vez da Graph API (que exige app/token na Meta), esta função lê uma URL de
// FEED JSON pronta — gerada por um serviço como Behold.so (plano grátis),
// RSS.app, EmbedSocial, etc. Você conecta o @contatoea no painel do serviço,
// copia a URL do feed JSON e cola na variável de ambiente abaixo.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   IG_FEED_URL   URL do feed JSON (ex.: https://feeds.behold.so/XXXXXXXX)
//   IG_LIMIT      (opcional) quantos posts exibir — padrão 9
//
// Sem IG_FEED_URL definida, o site mostra só o botão "Seguir @contatoea".
// Nenhum segredo fica versionado.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Normaliza diferentes formatos de feed para { image, permalink, caption, type }
function normalize(json) {
  let items = [];
  if (Array.isArray(json)) items = json;                       // ex.: [...]
  else if (Array.isArray(json.posts)) items = json.posts;      // Behold.so
  else if (Array.isArray(json.items)) items = json.items;      // JSON Feed (RSS.app)
  else if (Array.isArray(json.data)) items = json.data;        // Graph API legado
  else if (Array.isArray(json.media)) items = json.media;

  return items.map((p) => {
    // imagem: tenta os campos mais comuns entre provedores
    const sizes = p.sizes || {};
    const sized = (sizes.medium || sizes.large || sizes.full || sizes.small || {});
    const image =
      p.image || p.thumbnailUrl || p.thumbnail_url || p.mediaUrl || p.media_url ||
      sized.mediaUrl || sized.src || p.image_url || p.cover || '';
    const permalink = p.permalink || p.url || p.link || p.postUrl || '#';
    const caption = p.caption || p.prunedCaption || p.title || p.text || p.content_text || '';
    const rawType = (p.mediaType || p.media_type || p.type || '').toString().toUpperCase();
    const type = rawType.indexOf('VIDEO') >= 0 ? 'VIDEO' : (rawType || 'IMAGE');
    return { image, permalink, caption, type };
  }).filter((p) => p.image);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const feedUrl = process.env.IG_FEED_URL;
  const limit = Math.min(parseInt(process.env.IG_LIMIT || '9', 10) || 9, 24);

  if (!feedUrl) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ configured: false, posts: [] });
  }

  try {
    const r = await fetch(feedUrl, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=120');
      return res.status(200).json({ configured: true, error: 'feed_http_' + r.status, posts: [] });
    }
    const json = await r.json();
    const posts = normalize(json).slice(0, limit);

    // Cache na CDN da Vercel (~1h) → atualização automática sem refazer a busca a cada visita.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ configured: true, posts });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).json({ configured: true, error: 'exception', detail: String(e), posts: [] });
  }
}
