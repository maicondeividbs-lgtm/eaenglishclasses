// Função serverless da Vercel — retorna os vídeos mais recentes de um canal do
// YouTube para o site (index.html → seção "YouTube").
//
// Usa o feed RSS público do YouTube: NÃO precisa de chave de API nem de conta
// no Google Cloud.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   YT_CHANNEL_ID  (recomendado) ID do canal, começa com "UC..."
//                  → YouTube Studio → Configurações → Canal → Configurações avançadas
//   YT_HANDLE      (opcional) @ do canal, sem o "@". Padrão: vinilbeer
//                  Usado só se YT_CHANNEL_ID não estiver definido.
//   YT_LIMIT       (opcional) quantos vídeos exibir — padrão 6

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function decode(t) {
  return (t || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? decode(m[1]) : '';
}

// Descobre o ID "UC..." a partir do @handle lendo a página pública do canal.
async function resolveHandle(handle) {
  const r = await fetch('https://www.youtube.com/@' + encodeURIComponent(handle), {
    headers: { 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return '';
  const html = await r.text();
  const m =
    html.match(/"externalId":"(UC[\w-]{22})"/) ||
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
    html.match(/"channelId":"(UC[\w-]{22})"/);
  return m ? m[1] : '';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const handle = (process.env.YT_HANDLE || 'vinilbeer').replace(/^@/, '');
  const limit = Math.min(parseInt(process.env.YT_LIMIT || '6', 10) || 6, 15);
  const channelUrl = 'https://www.youtube.com/@' + handle;

  try {
    const channelId = process.env.YT_CHANNEL_ID || (await resolveHandle(handle));
    if (!channelId) {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json({ error: 'channel_not_found', channelUrl, videos: [] });
    }

    const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=120');
      return res.status(200).json({ error: 'feed_http_' + r.status, channelUrl, videos: [] });
    }
    const xml = await r.text();

    const channelTitle = tag(xml.split('<entry>')[0], 'title');
    const videos = (xml.match(/<entry>[\s\S]*?<\/entry>/g) || [])
      .map((e) => {
        const id = tag(e, 'yt:videoId');
        const link = (e.match(/<link[^>]+href="([^"]+)"/) || [])[1] || '';
        return {
          id,
          title: tag(e, 'title'),
          published: tag(e, 'published'),
          url: link || 'https://www.youtube.com/watch?v=' + id,
          short: link.indexOf('/shorts/') >= 0,
          thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        };
      })
      .filter((v) => /^[\w-]{11}$/.test(v.id))
      .slice(0, limit);

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ channelTitle, channelUrl, videos });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=120');
    return res.status(200).json({ error: 'exception', detail: String(e), channelUrl, videos: [] });
  }
}
