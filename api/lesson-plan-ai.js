// Função serverless da Vercel — roda no SERVIDOR, não no navegador.
// Sugere, para uma aula do plano, um OBJETIVO ou um HOMEWORK a partir do
// tópico, nível (CEFR) e livro do aluno. Gerado pela API do Google Gemini.
//
// A chave fica na variável de ambiente GEMINI_API_KEY (Vercel) — nunca no cliente.
//
// Endpoint: POST /api/lesson-plan-ai
//   body: { "kind":"objective"|"homework", "topic":"...", "level":"A2",
//           "book":"Interchange 2", "pages":"47, 48" }
//   resposta: { "text":"...", "kind":"objective" }

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY não configurada na Vercel.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const kind  = (body.kind === 'homework') ? 'homework' : 'objective';
  const topic = String(body.topic || '').trim();
  const level = String(body.level || '').trim();
  const book  = String(body.book  || '').trim();
  const pages = String(body.pages || '').trim();

  if (!topic) { res.status(400).json({ error: 'Informe o tópico da aula primeiro.' }); return; }

  const ctx =
    (book  ? ' O material é ' + book + '.' : '') +
    (level ? ' Nível CEFR do aluno: ' + level + '.' : '') +
    (pages ? ' Páginas previstas: ' + pages + '.' : '');

  let prompt;
  if (kind === 'homework') {
    prompt =
      'Você é um professor de inglês experiente da escola EA English Classes (material Cambridge). ' +
      'Para uma aula individual cujo tópico é "' + topic + '".' + ctx + ' ' +
      'Sugira UMA tarefa de casa (homework) objetiva, específica e realista para essa aula, ' +
      'coerente com o material e as páginas. Pode citar exercícios (ex.: Workbook, Grammar plus) ' +
      'e uma pequena atividade de escrita. Máximo 220 caracteres. ' +
      'Responda APENAS com JSON válido, sem markdown: {"homework":"..."}';
  } else {
    prompt =
      'Você é um professor de inglês experiente da escola EA English Classes (material Cambridge). ' +
      'Para uma aula individual cujo tópico é "' + topic + '".' + ctx + ' ' +
      'Escreva UM objetivo de aprendizagem claro e conciso, em português do Brasil, descrevendo o que ' +
      'o aluno será capaz de fazer ao final da aula (adequado ao nível). Uma frase, máximo 160 caracteres. ' +
      'Responda APENAS com JSON válido, sem markdown: {"objective":"..."}';
  }

  let lastDiag = '';
  for (const model of GEMINI_MODELS) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    try {
      const aiResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 400 }
        })
      });

      const rawText = await aiResp.text();

      if (!aiResp.ok) {
        lastDiag = 'HTTP ' + aiResp.status + ' (' + model + '): ' + rawText.slice(0, 300);
        console.error('Gemini error:', lastDiag);
        if (aiResp.status === 404) continue;
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
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a >= 0 && b > a) text = text.slice(a, b + 1);

      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        lastDiag = 'Texto da IA não era JSON: ' + text.slice(0, 200);
        console.error(lastDiag);
        res.status(502).json({ error: 'Resposta inesperada da IA.', diag: lastDiag });
        return;
      }

      const out = String((kind === 'homework' ? parsed.homework : parsed.objective) || '').trim();
      if (!out) { res.status(502).json({ error: 'A IA não gerou resposta.', diag: 'campo vazio' }); return; }

      res.status(200).json({ text: out, kind: kind });
      return;

    } catch (e) {
      lastDiag = 'Exceção (' + model + '): ' + (e && e.message ? e.message : String(e));
      console.error('Erro na função lesson-plan-ai:', lastDiag);
    }
  }

  res.status(502).json({ error: 'Não foi possível gerar a sugestão.', diag: lastDiag });
}
