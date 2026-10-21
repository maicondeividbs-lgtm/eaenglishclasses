// Função serverless da Vercel — retorna as publicações recentes do Instagram
// da WIN para o site (index.html → seção "Instagram").
//
// ► VERSÃO SEM APP NA META (acessível no Brasil)
// Em vez da Graph API (que exige app/token na Meta), esta função lê uma URL de
// FEED JSON pronta — gerada por um serviço como Behold.so (plano grátis),
// RSS.app, EmbedSocial, etc. Você conecta o @contatowin no painel do serviço,
// copia a URL do feed JSON e cola na variável de ambiente abaixo.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   IG_FEED_URL   URL do feed JSON (ex.: https://feeds.behold.so/XXXXXXXX)
//   IG_LIMIT      (opcional) quantos posts exibir — padrão 9
//
// Sem IG_FEED_URL definida, o site mostra só o botão "Seguir @contatowin".
// Nenhum segredo fica versionado.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Escolhe a melhor imagem do post.
// IMPORTANTE: as URLs "cruas" do Instagram (scontent.cdninstagram.com) EXPIRAM
// depois de alguns dias e às vezes bloqueiam hotlink → imagens quebradas no site.
// Por isso damos preferência às cópias hospedadas pelo provedor (Behold: "sizes").
function pickImage(p) {
  const s = p.sizes || {};
  const sized =
    (s.medium && (s.medium.mediaUrl || s.medium.src)) ||
    (s.large && (s.large.mediaUrl || s.large.src)) ||
    (s.small && (s.small.mediaUrl || s.small.src)) ||
    (s.full && (s.full.mediaUrl || s.full.src)) || '';
  if (sized) return sized;

  const rawType = (p.mediaType || p.media_type || p.type || '').toString().toUpperCase();
  const isVideo = rawType.indexOf('VIDEO') >= 0 || rawType.indexOf('REEL') >= 0;
  const thumb = p.thumbnailUrl || p.thumbnail_url || p.image || p.image_url || p.cover || '';
  if (thumb) return thumb;
  if (!isVideo) return p.mediaUrl || p.media_url || '';   // em vídeo, mediaUrl é o .mp4

  // carrossel/vídeo sem miniatura: usa o primeiro filho
  const kids = (p.children && (p.children.data || p.children)) || [];
  for (const k of (Array.isArray(kids) ? kids : [])) {
    const img = pickImage(k);
    if (img) return img;
  }
  return '';
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
    const image = pickImage(p);
    const permalink = p.permalink || p.url || p.link || p.postUrl || 'https://www.instagram.com/contatowin';
    const caption = p.prunedCaption || p.caption || p.title || p.text || p.content_text || '';
    const rawType = (p.mediaType || p.media_type || p.type || '').toString().toUpperCase();
    const type = (rawType.indexOf('VIDEO') >= 0 || rawType.indexOf('REEL') >= 0) ? 'VIDEO' : 'IMAGE';
    return { image, permalink, caption, type };
  }).filter((p) => p.image && /^https:\/\//.test(p.image));
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
    const r = await fetch(feedUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=120');
      return res.status(200).json({ configured: true, error: 'feed_http_' + r.status, posts: [] });
    }
    const json = await r.json();
    const posts = normalize(json).slice(0, limit);

    // Cache na CDN da Vercel (30 min). O "stale" curto evita servir por muito tempo
    // URLs de imagem que já expiraram.
    res.setHeader('Cache-Control', posts.length
      ? 'public, s-maxage=1800, stale-while-revalidate=3600'
      : 'public, s-maxage=120');
    return res.status(200).json({ configured: true, posts });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).json({ configured: true, error: 'exception', detail: String(e), posts: [] });
  }
}
