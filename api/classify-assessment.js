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
//   GEMINI_MODEL    (padrão: gemini-2.5-flash-lite — rápido e barato; troque para
//                    gemini-2.5-flash se quiser mais precisão, sem mexer no código)

const STATUSES = ['NORMAL','CANCELED_NO_24H','CANCELED_24H','HOLIDAY','VACATION','RECESS','TEACHER_ABSENT','STUDENT_ABSENT','MOVED_HERE','MOVED_AWAY'];

function getKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
}

const GUIDE = `Você classifica descrições de aulas particulares de inglês para o cálculo do PAGAMENTO do professor. Para CADA descrição, escolha exatamente um status e diga se é meia aula (30 min). Como isto define salário, na dúvida entre "paga" e "não paga", prefira a interpretação mais literal do texto — não invente motivo de falta que não esteja escrito.

STATUS E SE O PROFESSOR RECEBE:
- NORMAL (recebe): aula normalmente dada. É o PADRÃO — use sempre que houver conteúdo de aula (Unit, Page, Exercise, gramática, conversação etc.).
- CANCELED_NO_24H (recebe): o ALUNO cancelou/desmarcou SEM 24h de antecedência (em cima da hora, "menos de 24h", "sem avisar").
- CANCELED_24H (NÃO recebe): o ALUNO cancelou/desmarcou COM 24h ou mais de antecedência.
- STUDENT_ABSENT (recebe): falta PONTUAL do aluno no dia — não compareceu / no-show / não avisou.
- MOVED_HERE (recebe): a aula de OUTRO dia foi TRAZIDA e dada HOJE. Ex.: "antecipação do dia 22", "antecipei a aula de sexta", "reposição", "repôs", "aula reposta".
- RECESS (recebe): recesso/férias/pausa DA ESCOLA (a escola não teve aula naquele período).
- VACATION (NÃO recebe): férias/ausência prolongada DO ALUNO. Ex.: "aluno em período de ausência", "aluno de férias", "aluno viajou", "aluno fora".
- HOLIDAY (NÃO recebe): feriado (nacional, estadual ou municipal) sem aula.
- TEACHER_ABSENT (NÃO recebe): o PROFESSOR faltou ou cancelou a aula.
- MOVED_AWAY (NÃO recebe): a aula DESTE dia foi dada/ocorrerá em OUTRA data — este horário ficou vazio. Ex.: "aula antecipada em 15/03", "aula já antecipada", "remarcada com antecedência para o dia 20".

REGRA-CHAVE (antecipação/remarcação) — decida pela DIREÇÃO, não pela palavra "antecipa":
- "antecipada EM [data]" / "antecipada PARA [data]" / "já antecipada" / "remarcada/reagendada PARA o dia X" => a aula SAIU deste dia => MOVED_AWAY (NÃO recebe aqui; ela é paga na data em que aconteceu).
- "antecipação DO dia X" / "antecipei ... hoje" / "reposição" / "repôs" / "aula reposta" => a aula VEIO para hoje e ACONTECEU => MOVED_HERE (recebe).
Num par (linha vazia de origem + linha onde a aula foi dada), apenas UMA é paga: a que ACONTECEU.

FÉRIAS/RECESSO — de QUEM?
- Da ESCOLA (recesso escolar, pausa coletiva, feriado prolongado da escola) => RECESS (recebe).
- Do ALUNO (aluno de férias, viajou, período de ausência) => VACATION (NÃO recebe).

TEMA x MOTIVO DE FALTA:
As unidades (Interchange/Evolve) têm títulos como "Vacations", "Holidays", "Free time". Quando "Vacation(s)", "Holiday(s)" ou "Recess" aparecem como TEMA/conteúdo (junto de Unit/Page/Exercise/Lesson/matéria dada), a aula ACONTECEU => use NORMAL, nunca VACATION/HOLIDAY/RECESS. Só use esses status quando o texto disser que NÃO houve aula por esse motivo.

MEIA AULA (half=true) SOMENTE com indício EXPLÍCITO de duração curta: "30 min", "30 minutos", "meia hora", "meia aula", "metade", "aula reduzida", "aula de 30". NUNCA marque half por causa de "Page 30", "p. 30", "pg 30", "Unit 5", "Exercise 2", "Lesson 3" — são página/unidade/exercício/lição.

Na dúvida entre NORMAL e um status especial, só use o especial se houver indício claro; senão use NORMAL.

Exemplos:
- "Conversation + Page 30 (Exercise 2) - Unit 5 - Mixed feelings" => {"status":"NORMAL","half":false}
- "Unit 8 - Reading p. 30" => {"status":"NORMAL","half":false}
- "Aula de 30 minutos (aluno chegou atrasado)" => {"status":"NORMAL","half":true}
- "Aluno desmarcou com menos de 24 horas" => {"status":"CANCELED_NO_24H","half":false}
- "Cancelou sem avisar, menos de 24h" => {"status":"CANCELED_NO_24H","half":false}
- "Aluno cancelou com 24 horas de antecedência" => {"status":"CANCELED_24H","half":false}
- "Aula antecipada em 15/03" => {"status":"MOVED_AWAY","half":false}
- "Aula já antecipada" => {"status":"MOVED_AWAY","half":false}
- "Aula remarcada com antecedência para o dia 20/03" => {"status":"MOVED_AWAY","half":false}
- "Antecipação do dia 22/03 - Unit 6" => {"status":"MOVED_HERE","half":false}
- "Reposição dia 31/03 - Pages 28, 29 & 30 (Exercise 1) - Unit 5 - Vacations" => {"status":"MOVED_HERE","half":false}
- "Feriado nacional" => {"status":"HOLIDAY","half":false}
- "Feriado de Tiradentes, sem aula" => {"status":"HOLIDAY","half":false}
- "Professor não pôde dar a aula" => {"status":"TEACHER_ABSENT","half":false}
- "Recesso escolar - sem aula" => {"status":"RECESS","half":false}
- "Aluno em período de ausência" => {"status":"VACATION","half":false}
- "Aluno de férias esta semana, sem aula" => {"status":"VACATION","half":false}
- "Aluno faltou sem avisar" => {"status":"STUDENT_ABSENT","half":false}
- "Unit 7 - Holidays around the world" => {"status":"NORMAL","half":false}`;

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
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        // "thinking" desligado = bem mais rápido e barato; saída idêntica para classificação.
        // Modelos 2.5 usam thinkingBudget; modelos 3.x usam thinkingLevel.
        thinkingConfig: /gemini-3/.test(model) ? { thinkingLevel: 'low' } : { thinkingBudget: 0 }
      }
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

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    // Lotes em PARALELO (com limite de concorrência), para reduzir a latência.
    const CHUNK = 50;
    const chunks = [];
    for (let i = 0; i < descriptions.length; i += CHUNK) chunks.push(descriptions.slice(i, i + CHUNK));

    const LIMIT = 4; // chamadas simultâneas — respeita o rate limit do plano gratuito
    const partial = new Array(chunks.length);
    let next = 0;
    async function worker() {
      while (next < chunks.length) {
        const my = next++;
        partial[my] = await callGemini(chunks[my], key, model);
      }
    }
    const workers = [];
    for (let w = 0; w < Math.min(LIMIT, chunks.length); w++) workers.push(worker());
    await Promise.all(workers);

    const out = [];
    chunks.forEach((part, ci) => {
      const arr = partial[ci] || [];
      for (let j = 0; j < part.length; j++) {
        const it = arr[j] || {};
        const st = STATUSES.includes(it.status) ? it.status : 'NORMAL';
        out.push({ status: st, half: !!it.half });
      }
    });
    res.status(200).json({ results: out, model });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
}
