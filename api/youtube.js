// Função serverless da Vercel — retorna os vídeos mais recentes de um canal do
// YouTube para o site (index.html → seção "YouTube").
//
// Fontes, em ordem:
//   1) YouTube Data API v3 — só se YT_API_KEY existir (mais estável; gratuita,
//      gasta ~1 unidade da cota diária de 10.000 por chamada).
//   2) Feed RSS público do canal (sem chave), com nova tentativa e com o feed
//      da playlist de uploads como reserva. O RSS do YouTube às vezes devolve
//      404 por horas para servidores de nuvem (Vercel/AWS).
// Se tudo falhar, responde 503 SEM cache: assim a CDN da Vercel continua
// servindo a última lista boa (stale-while-revalidate) em vez de uma lista vazia.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   YT_CHANNEL_ID  (recomendado) ID do canal, começa com "UC..."
//                  → YouTube Studio → Configurações → Canal → Configurações avançadas
//   YT_HANDLE      (opcional) @ do canal, sem o "@". Padrão: vinilbeer
//   YT_LIMIT       (opcional) quantos vídeos exibir — padrão 6 (máx. 15)
//   YT_API_KEY     (opcional) chave da YouTube Data API v3 (Google Cloud)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const okId = (v) => /^[\w-]{11}$/.test(v.id);
const thumb = (id) => 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';

// Descobre o ID "UC..." a partir do @handle lendo a página pública do canal.
async function resolveHandle(handle) {
  try {
    const r = await fetch('https://www.youtube.com/@' + encodeURIComponent(handle), {
      headers: { 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': UA, Cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return '';
    const html = await r.text();
    const m =
      html.match(/"externalId":"(UC[\w-]{22})"/) ||
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
      html.match(/"channelId":"(UC[\w-]{22})"/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

// 1) YouTube Data API v3
async function fromApi(key, channelId, handle, limit) {
  let uploads = channelId ? 'UU' + channelId.slice(2) : '';
  let title = '';
  if (!uploads) {
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&forHandle=@' +
      encodeURIComponent(handle) + '&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('api_channels_' + r.status);
    const j = await r.json();
    const ch = j.items && j.items[0];
    if (!ch) throw new Error('api_channel_not_found');
    uploads = ch.contentDetails.relatedPlaylists.uploads;
    title = (ch.snippet && ch.snippet.title) || '';
  }
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=' + limit +
    '&playlistId=' + uploads + '&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('api_playlist_' + r.status);
  const j = await r.json();
  const videos = (j.items || []).map((it) => {
    const s = it.snippet || {};
    const id = (s.resourceId && s.resourceId.videoId) || '';
    return {
      id, title: s.title || '', published: s.publishedAt || '',
      url: 'https://www.youtube.com/watch?v=' + id, short: false, thumb: thumb(id),
    };
  }).filter((v) => okId(v) && v.title !== 'Private video' && v.title !== 'Deleted video');
  return { channelTitle: title || (videos[0] && j.items[0].snippet.channelTitle) || '', videos };
}

// 2) Feed RSS (canal e, como reserva, playlist de uploads), 2 tentativas cada
async function fromRss(channelId, limit, deadline) {
  const urls = [
    'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
    'https://www.youtube.com/feeds/videos.xml?playlist_id=UU' + channelId.slice(2),
  ];
  let last = 'feed_failed';
  for (const url of urls) {
    for (let i = 0; i < 2; i++) {
      if (Date.now() > deadline) return Promise.reject(new Error(last + '_timeout'));
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' }, signal: AbortSignal.timeout(3000) });
        if (r.ok) {
          const xml = await r.text();
          const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
          if (entries.length) {
            const channelTitle = tag(xml.split('<entry>')[0], 'title');
            const videos = entries.map((e) => {
              const id = tag(e, 'yt:videoId');
              const link = (e.match(/<link[^>]+href="([^"]+)"/) || [])[1] || '';
              return {
                id, title: tag(e, 'title'), published: tag(e, 'published'),
                url: link || 'https://www.youtube.com/watch?v=' + id,
                short: link.indexOf('/shorts/') >= 0, thumb: thumb(id),
              };
            }).filter(okId).slice(0, limit);
            if (videos.length) return { channelTitle, videos };
          }
          last = 'feed_empty';
        } else last = 'feed_http_' + r.status;
      } catch (e) { last = 'feed_' + (e.name || 'error'); }
      await sleep(400);
    }
  }
  throw new Error(last);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const handle = (process.env.YT_HANDLE || 'vinilbeer').replace(/^@/, '');
  const limit = Math.min(parseInt(process.env.YT_LIMIT || '6', 10) || 6, 15);
  const key = process.env.YT_API_KEY || '';
  const channelUrl = 'https://www.youtube.com/@' + handle;
  const errors = [];
  const deadline = Date.now() + 8000; // limite das funções no plano Hobby

  const ok = (data, source) => {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=604800');
    return res.status(200).json(Object.assign({ channelUrl, source }, data));
  };

  let channelId = (process.env.YT_CHANNEL_ID || '').trim();

  if (key) {
    try { return ok(await fromApi(key, channelId, handle, limit), 'api'); }
    catch (e) { errors.push(String(e.message || e)); }
  }

  if (!channelId) channelId = await resolveHandle(handle);
  if (channelId) {
    try { return ok(await fromRss(channelId, limit, deadline), 'rss'); }
    catch (e) { errors.push(String(e.message || e)); }
  } else errors.push('channel_not_found');

  // Sem cache: a CDN mantém a última resposta boa enquanto o YouTube falha.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({ error: errors[errors.length - 1], detail: errors.join(' | '), channelUrl, videos: [] });
}
