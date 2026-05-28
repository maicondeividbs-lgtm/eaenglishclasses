// Função serverless da Vercel — roda no SERVIDOR, não no navegador.
// Recebe uma palavra em inglês e devolve tradução, frase de exemplo
// e classe gramatical, geradas pela API do Google Gemini.
//
// A chave da API fica na variável de ambiente GEMINI_API_KEY,
// configurada no painel da Vercel — nunca exposta ao navegador.
//
// Endpoint: POST /api/vocabulary   body: { "word": "improve" }

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export default async function handler(req, res) {
  // Libera o próprio site a chamar esta função.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY não configurada na Vercel.' });
    return;
  }

  // O corpo pode vir como objeto (Vercel já parseia JSON) ou como string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const word = (body && body.word ? String(body.word) : '').trim();
  if (!word) {
    res.status(400).json({ error: 'Informe a palavra.' });
    return;
  }

  const prompt =
    'Você é um professor de inglês. Para a palavra ou expressão em inglês "' + word + '", ' +
    'responda APENAS com um objeto JSON válido, sem markdown e sem texto extra, neste formato exato:\n' +
    '{"translation":"tradução em português do Brasil","sentence":"uma frase de exemplo simples e natural em inglês usando a palavra","part_of_speech":"classe gramatical em português, ex: verbo, substantivo, adjetivo, advérbio, expressão"}';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent';

  try {
    const aiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
          // Pede ao Gemini que devolva JSON puro, sem markdown.
          responseMimeType: 'application/json'
        }
      })
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('Gemini error:', aiResp.status, errText);
      res.status(502).json({ error: 'Falha ao consultar a IA.' });
      return;
    }

    const data = await aiResp.json();
    // Extrai o texto da resposta do Gemini.
    let text = '';
    try {
      const parts = data.candidates[0].content.parts;
      text = parts.map(p => p.text || '').join('').trim();
    } catch (e) {
      console.error('Resposta inesperada do Gemini:', JSON.stringify(data).slice(0, 500));
      res.status(502).json({ error: 'Resposta inesperada da IA.' });
      return;
    }

    // Remove eventuais cercas de markdown, por segurança.
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('Resposta não-JSON da IA:', text);
      res.status(502).json({ error: 'Resposta inesperada da IA.' });
      return;
    }

    res.status(200).json({
      translation: parsed.translation || '',
      sentence: parsed.sentence || '',
      part_of_speech: parsed.part_of_speech || ''
    });
  } catch (e) {
    console.error('Erro na função de vocabulário:', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
}
