// Função serverless da Vercel — classifica descrições de aulas (planilhas de
// assessment) usando o Gemini. A ferramenta "Contagem de Aulas e Salário" chama
// esta função APENAS para as descrições que a detecção determinística (regex)
// não reconheceu com certeza — assim o cálculo continua reprodutível e a IA só
// reforça as variações de texto.
//
// A chave do Gemini fica nas variáveis de ambiente da Vercel (NUNCA no cliente).
// Variáveis de ambiente aceitas (usa a primeira encontrada):
//   GEMINI_API_KEY  |  GOOGLE_API_KEY  |  GOOGLE_GENERATIVE_AI_API_KEY
// Opcional:
//   GEMINI_MODEL    (padrão: gemini-2.5-flash)

const STATUSES = ['NORMAL','CANCELED_NO_24H','CANCELED_24H','HOLIDAY','VACATION','RECESS','TEACHER_ABSENT','STUDENT_ABSENT','MOVED_HERE','MOVED_AWAY'];

function getKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
}

const GUIDE = `Você classifica descrições de aulas particulares de inglês, para o cálculo de pagamento do professor.
Para CADA descrição, escolha exatamente um status e diga se é meia aula (30 min).
Definições dos status:
- NORMAL: aula normalmente dada (qualquer conteúdo de aula). É o padrão.
- CANCELED_NO_24H: o ALUNO cancelou SEM 24h de antecedência.
- CANCELED_24H: o ALUNO cancelou COM 24h (ou mais) de antecedência.
- HOLIDAY: feriado / holiday.
- VACATION: férias / vacation.
- RECESS: recesso / recess.
- TEACHER_ABSENT: o PROFESSOR faltou ou cancelou a aula.
- STUDENT_ABSENT: o aluno não compareceu sem avisar (no-show / falta do aluno).
- MOVED_HERE: aula antecipada/remarcada que ACONTECEU nesta data.
- MOVED_AWAY: aula que foi movida para OUTRA data (não acontece nesta).
half = true quando a descrição indicar meia aula, 30 minutos, meia hora, metade ou equivalente; caso contrário false.
Na dúvida entre NORMAL e um status especial, só use o status especial se houver indício claro no texto; senão use NORMAL.`;

async function callGemini(items, key, model) {
  const list = items.map((t, i) => i + ': ' + String(t).replace(/\s+/g, ' ').trim()).join('\n');
  const prompt = GUIDE +
    '\n\nClassifique as descrições a seguir (uma por linha, no formato "indice: texto"):\n' + list +
    '\n\nResponda SOMENTE um array JSON, na MESMA ordem e com o MESMO número de itens, no formato:\n' +
    '[{"status":"<STATUS>","half":<true|false>}]\n' +
    'Use exatamente um destes status: ' + STATUSES.join(', ') + '.';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  if (!r.ok) {
    const tx = await r.text().catch(() => '');
    throw new Error('Gemini HTTP ' + r.status + ' ' + tx.slice(0, 300));
  }
  const data = await r.json();
  const cand = (data.candidates || [])[0] || {};
  const parts = (cand.content && cand.content.parts) || [];
  const txt = parts.map(p => p.text || '').join('').trim();
  let arr;
  try { arr = JSON.parse(txt); }
  catch (e) { const m = txt.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; }
  return Array.isArray(arr) ? arr : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  try {
    const key = getKey();
    if (!key) {
      res.status(500).json({ error: 'Chave do Gemini ausente. Defina GEMINI_API_KEY nas variáveis de ambiente da Vercel.' });
      return;
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    const descriptions = (body && Array.isArray(body.descriptions)) ? body.descriptions : [];
    if (!descriptions.length) { res.status(200).json({ results: [] }); return; }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Lotes, para o caso de muitas descrições.
    const CHUNK = 60;
    const out = [];
    for (let i = 0; i < descriptions.length; i += CHUNK) {
      const part = descriptions.slice(i, i + CHUNK);
      const arr = await callGemini(part, key, model);
      for (let j = 0; j < part.length; j++) {
        const it = arr[j] || {};
        const st = STATUSES.includes(it.status) ? it.status : 'NORMAL';
        out.push({ status: st, half: !!it.half });
      }
    }
    res.status(200).json({ results: out, model });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
}
