// Função serverless da Vercel — roda no SERVIDOR, não no navegador.
// Recebe uma palavra em inglês e devolve tradução, frase de exemplo
// e classe gramatical, geradas pela API do Google Gemini.
//
// A chave da API fica na variável de ambiente GEMINI_API_KEY,
// configurada no painel da Vercel — nunca exposta ao navegador.
//
// Endpoint: POST /api/vocabulary   body: { "word": "improve" }

// Modelos tentados em ordem (se o 1º não existir para a chave, tenta o 2º).
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

export default async function handler(req, res) {
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

  let lastDiag = ''; // guarda a última pista de erro para diagnóstico

  for (const model of GEMINI_MODELS) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      model + ':generateContent';
    try {
      const aiResp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
        })
      });

      const rawText = await aiResp.text();

      if (!aiResp.ok) {
        lastDiag = 'HTTP ' + aiResp.status + ' (' + model + '): ' + rawText.slice(0, 300);
        console.error('Gemini error:', lastDiag);
        if (aiResp.status === 404) continue; // modelo inexistente: tenta o próximo
        res.status(502).json({ error: 'Gemini recusou a requisição.', diag: lastDiag });
        return;
      }

      let data;
      try { data = JSON.parse(rawText); }
      catch (e) {
        lastDiag = 'Corpo não-JSON do Gemini: ' + rawText.slice(0, 200);
        console.error(lastDiag);
        res.status(502).json({ error: 'Resposta inesperada da IA.', diag: lastDiag });
        return;
      }

      let text = '';
      try {
        const cand = (data.candidates && data.candidates[0]) || {};
        const parts = (cand.content && cand.content.parts) || [];
        text = parts.map(p => p.text || '').join('').trim();
      } catch (e) { text = ''; }

      if (!text) {
        const reason = (data.promptFeedback && data.promptFeedback.blockReason) ||
          (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || 'sem texto';
        lastDiag = 'Gemini não retornou texto (' + model + '): ' + reason;
        console.error(lastDiag, JSON.stringify(data).slice(0, 300));
        res.status(502).json({ error: 'A IA não gerou resposta.', diag: lastDiag });
        return;
      }

      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }

      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        lastDiag = 'Texto da IA não era JSON: ' + text.slice(0, 200);
        console.error(lastDiag);
        res.status(502).json({ error: 'Resposta inesperada da IA.', diag: lastDiag });
        return;
      }

      res.status(200).json({
        translation: parsed.translation || '',
        sentence: parsed.sentence || '',
        part_of_speech: parsed.part_of_speech || ''
      });
      return;

    } catch (e) {
      lastDiag = 'Exceção (' + model + '): ' + (e && e.message ? e.message : String(e));
      console.error('Erro na função de vocabulário:', lastDiag);
    }
  }

  res.status(502).json({ error: 'Não foi possível gerar a resposta.', diag: lastDiag });
}
