/* ═══════════════════════════════════════════════════════════════
   WIN — Supervisão: pop-up de leitura (dashboard da coordenação)

   Clicar em qualquer item da Supervisão abre um pop-up com TUDO
   o que o professor enviou e como o aluno reagiu:
     • Homework     → descrição, prazo e, por aluno, se abriu e quando entregou
     • Feedback     → texto completo, categoria e se o aluno leu
     • Redação      → tema, texto do aluno, nota, comentário geral e
                      comentários no texto; botão para corrigir/editar
     • Pronúncia    → palavra, fonética, observações e se praticou
     • Vocabulário  → palavra, tradução, frase e se o aluno estudou
   Setas do teclado (← →) passam para o item anterior/seguinte da lista;
   Esc fecha. Só leitura: nada aqui altera dados.

   Uso pelas listas:  SUP_VIEW.setItems('fb', lista)
                      <div class="list-item sv-click" data-sv="fb" data-id="…">
   ═══════════════════════════════════════════════════════════════ */

var SUP_VIEW = (function () {
  'use strict';

  var lists = {};
  var cur = { kind: null, idx: -1 };
  var since;           // início do registro de "visto" (menu_contadores.sql)
  var lastFocus = null;

  var KIND = {
    hw:    { icon: '📝', name: 'Homework' },
    fb:    { icon: '💬', name: 'Feedback' },
    wr:    { icon: '✍️', name: 'Redação' },
    pr:    { icon: '🎙️', name: 'Pronúncia' },
    vocab: { icon: '📚', name: 'Vocabulário' }
  };
  var WR_CAT = { grammar: 'Gramática', vocabulary: 'Vocabulário', spelling: 'Ortografia', style: 'Estilo', punctuation: 'Pontuação', coherence: 'Coerência' };

  // ── utilidades ─────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dt(v) {
    if (!v) return '';
    var d = new Date(v); if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dOnly(v) {
    if (!v) return '';
    var d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v); if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function name(o, fb) { return (o && o.full_name) || fb || '—'; }
  function text(v, emptyMsg) {
    return v && String(v).trim()
      ? '<div class="sv-text">' + esc(v) + '</div>'
      : '<div class="sv-text empty">' + esc(emptyMsg || 'Sem texto.') + '</div>';
  }
  function sec(title, inner, sub) {
    return '<section class="sv-sec"><h3 class="sv-sec-title">' + esc(title) + (sub ? ' <span>' + esc(sub) + '</span>' : '') + '</h3>' + inner + '</section>';
  }
  function facts(rows) {
    rows = rows.filter(function (r) { return r && r[1]; });
    if (!rows.length) return '';
    return '<dl class="sv-facts">' + rows.map(function (r) {
      return '<div class="sv-fact"><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>';
  }

  // Estado de "visto": data real, "ainda não abriu" ou "sem registro"
  // (envios anteriores ao início da contagem não têm como ser medidos).
  function seenState(row) {
    if (row && row.seen_at) return { done: true, when: dt(row.seen_at) };
    var tracked = since && row && row.created_at && new Date(row.created_at) >= since &&
      Object.prototype.hasOwnProperty.call(row, 'seen_at');
    return tracked ? { done: false, when: 'Ainda não abriu' } : { done: false, when: 'Sem registro', na: true };
  }

  function steps(arr) {
    return '<ol class="sv-steps">' + arr.map(function (s, i) {
      var cls = s.done ? 'done' : (s.alert ? 'alert' : 'wait');
      return '<li class="sv-step ' + cls + '"><div class="sv-dot" aria-hidden="true">' + (s.done ? '✓' : (i + 1)) + '</div>' +
        '<div class="sv-step-label">' + esc(s.label) + '</div>' +
        '<div class="sv-step-when">' + esc(s.when || '') + '</div></li>';
    }).join('') + '</ol>';
  }

  function parseWr(fb) {
    if (!fb) return { general: '', inline: [] };
    if (typeof fb === 'object') return { general: fb.general || '', inline: fb.inline || [] };
    try {
      var o = JSON.parse(fb);
      if (o && typeof o === 'object') return { general: o.general || '', inline: Array.isArray(o.inline) ? o.inline : [] };
    } catch (e) { /* texto simples */ }
    return { general: String(fb), inline: [] };
  }

  // ── conteúdo por tipo ──────────────────────────────────────
  function buildHw(t) {
    var subs = (t.task_submissions || []).slice().sort(function (a, b) {
      return name(a.student).localeCompare(name(b.student), 'pt-BR');
    });
    var due = t.due_date ? new Date(String(t.due_date).length === 10 ? t.due_date + 'T23:59:59' : t.due_date) : null;
    var now = new Date();
    var done = 0, opened = 0, late = 0, tracked = 0;
    var rows = subs.map(function (s) {
      var isDone = s.status && s.status !== 'pending';
      var sv = seenState(s);
      if (isDone) done++;
      if (sv.done) opened++;
      if (!sv.na) tracked++;
      var lateNow = !isDone && due && due < now && !t.cancelled;
      if (lateNow) late++;
      var entrega = isDone
        ? '✓ Feito' + (s.submitted_at ? ' em ' + esc(dt(s.submitted_at)) : '')
        : (lateNow ? '<span class="sv-late">Atrasado</span>' : '<span class="sv-muted">Pendente</span>');
      return '<tr><td>' + esc(name(s.student, 'Aluno')) + '</td>' +
        '<td class="' + (sv.done ? '' : 'sv-muted') + '">' + (sv.done ? '👁 ' : '') + esc(sv.when) + '</td>' +
        '<td>' + entrega + '</td></tr>';
    }).join('');

    var chips = '<div class="sv-summary">' +
      '<span class="sv-chip ok">✓ ' + done + ' de ' + subs.length + ' feito' + (subs.length === 1 ? '' : 's') + '</span>' +
      (tracked ? '<span class="sv-chip">👁 ' + opened + ' de ' + tracked + ' abriram</span>' : '') +
      (late ? '<span class="sv-chip warn">' + late + ' atrasado' + (late === 1 ? '' : 's') + '</span>' : '') +
      '</div>';

    return {
      title: esc(t.title || 'Homework'),
      meta: metaLine(t.teacher, subs.length === 1 ? name(subs[0].student) : subs.length + ' alunos', t.created_at),
      body:
        (t.cancelled ? '<div class="sv-banner">🚫 Envio cancelado' + (t.cancelled_at ? ' em ' + esc(dt(t.cancelled_at)) : '') + '. Os alunos não veem mais esta tarefa.</div>' : '') +
        sec('O que foi enviado', text(t.description, 'O professor não escreveu uma descrição.') +
          (due ? '<div style="margin-top:10px">' + facts([['Prazo', esc(dOnly(t.due_date))]]) + '</div>' : '')) +
        sec('Reação dos alunos', subs.length
          ? chips + '<table class="sv-table"><thead><tr><th>Aluno</th><th>Abriu</th><th>Entrega</th></tr></thead><tbody>' + rows + '</tbody></table>'
          : text('', 'Nenhum aluno vinculado a esta tarefa.'))
    };
  }

  function buildFb(f) {
    var sv = seenState(f);
    return {
      title: esc(f.title || 'Feedback'),
      meta: metaLine(f.teacher, name(f.student), f.created_at),
      body:
        (f.cancelled ? '<div class="sv-banner">🚫 Envio cancelado' + (f.cancelled_at ? ' em ' + esc(dt(f.cancelled_at)) : '') + '. O aluno não vê mais este feedback.</div>' : '') +
        sec('Feedback do professor', text(f.content, 'Sem texto além do título.'), f.category ? 'Categoria: ' + f.category : '') +
        sec('Reação do aluno', steps([
          { label: 'Enviado', when: dt(f.created_at), done: true },
          { label: 'Lido pelo aluno', when: sv.when, done: sv.done }
        ]))
    };
  }

  function buildWr(w) {
    var sv = seenState(w);
    var fb = parseWr(w.feedback);
    var submitted = w.status === 'submitted' || w.status === 'graded';
    var graded = w.status === 'graded';
    var due = w.due_date ? new Date(String(w.due_date).length === 10 ? w.due_date + 'T23:59:59' : w.due_date) : null;
    var lateNow = !submitted && due && due < new Date();

    var correction = '';
    if (graded) {
      var comments = (fb.inline || []).map(function (c, i) {
        return '<div class="sv-comment"><div class="sv-comment-n">' + (i + 1) + '</div><div>' +
          (c.text ? '<div class="sv-comment-q">“' + esc(c.text) + '”' + (c.category ? '<span class="sv-comment-cat">' + esc(WR_CAT[c.category] || c.category) + '</span>' : '') + '</div>' : '') +
          '<div class="sv-comment-c">' + esc(c.comment || '') + '</div></div></div>';
      }).join('');
      correction = sec('Correção',
        (w.grade !== null && w.grade !== undefined && w.grade !== '' ? '<div class="sv-grade">' + esc(w.grade) + ' <span>nota</span></div>' : '') +
        (fb.general ? '<div style="margin-top:10px">' + text(fb.general) + '</div>' : '') +
        (comments ? '<div class="sv-comments">' + comments + '</div>' : ''),
        w.reviewed_at ? 'em ' + dt(w.reviewed_at) : '');
    }

    return {
      title: esc(w.title || 'Redação'),
      meta: metaLine(w.teacher, name(w.student), w.created_at),
      body:
        sec('Tema enviado', text(w.prompt, 'Sem tema.') +
          (w.due_date ? '<div style="margin-top:10px">' + facts([['Prazo', esc(dOnly(w.due_date))]]) + '</div>' : '')) +
        sec('Reação do aluno', steps([
          { label: 'Enviado', when: dt(w.created_at), done: true },
          { label: 'Aberto', when: sv.when, done: sv.done },
          { label: 'Redação entregue', when: submitted ? dt(w.submitted_at) : (lateNow ? 'Prazo vencido' : 'Aguardando'), done: submitted, alert: lateNow },
          { label: 'Corrigida', when: graded ? (dt(w.reviewed_at) || 'Sim') : (submitted ? 'Aguardando correção' : '—'), done: graded, alert: w.status === 'submitted' }
        ])) +
        (submitted ? sec('Texto do aluno', '<div class="sv-text quote">' + esc(w.response || '') + '</div>') : '') +
        correction,
      action: submitted ? { label: graded ? 'Editar correção' : 'Corrigir agora', fn: function () {
        close(true);
        if (typeof openWrCorrect === 'function') setTimeout(function () { openWrCorrect(w.id); }, 200);
      } } : null
    };
  }

  function buildPr(p) {
    var sv = seenState(p);
    return {
      title: esc(p.word || 'Pronúncia') + (p.phonetic ? '<small>' + esc(p.phonetic) + '</small>' : ''),
      meta: metaLine(p.teacher, name(p.student), p.created_at),
      body:
        sec('O que foi enviado', facts([['Palavra', esc(p.word)], ['Fonética', esc(p.phonetic)]]) +
          (p.notes ? '<div style="margin-top:10px">' + text(p.notes) + '</div>' : '')) +
        sec('Reação do aluno', steps([
          { label: 'Enviado', when: dt(p.created_at), done: true },
          { label: 'Aberto', when: sv.when, done: sv.done },
          { label: 'Praticou', when: p.practiced ? 'Sim' : 'Ainda não', done: !!p.practiced }
        ]))
    };
  }

  function buildVocab(v) {
    var sv = seenState(v);
    return {
      title: esc(v.word || 'Vocabulário') + (v.part_of_speech ? '<small>' + esc(v.part_of_speech) + '</small>' : ''),
      meta: metaLine(v.teacher, name(v.student), v.created_at),
      body:
        sec('O que o aluno vê', facts([['Palavra', esc(v.word)], ['Tradução', esc(v.translation)], ['Classe', esc(v.part_of_speech)]]) +
          (v.sentence ? '<div style="margin-top:10px">' + text(v.sentence) + '</div>' : '')) +
        sec('Reação do aluno', steps([
          { label: 'Enviado', when: dt(v.created_at), done: true },
          { label: 'Aberto', when: sv.when, done: sv.done },
          { label: 'Estudada', when: v.enriched ? 'Sim' : 'Ainda não', done: !!v.enriched }
        ]))
    };
  }

  function metaLine(teacher, student, when) {
    return '<span>Prof. <b>' + esc(name(teacher)) + '</b></span>' +
      '<span>Para <b>' + esc(student) + '</b></span>' +
      (when ? '<span>' + esc(dt(when)) + '</span>' : '');
  }

  var BUILD = { hw: buildHw, fb: buildFb, wr: buildWr, pr: buildPr, vocab: buildVocab };

  // ── pop-up ─────────────────────────────────────────────────
  var ov = null, box = null, onAction = null;

  function ensure() {
    if (ov) return;
    ov = document.createElement('div');
    ov.className = 'sv-overlay';
    ov.innerHTML =
      '<div class="sv-modal" role="dialog" aria-modal="true" aria-labelledby="svTitle">' +
        '<div class="sv-head"><div class="sv-kind" id="svKind"></div><h2 class="sv-title" id="svTitle"></h2>' +
          '<div class="sv-meta" id="svMeta"></div>' +
          '<button type="button" class="sv-x" id="svClose" aria-label="Fechar">✕</button></div>' +
        '<div class="sv-body" id="svBody"></div>' +
        '<div class="sv-foot">' +
          '<button type="button" class="sv-btn" id="svPrev" aria-label="Item anterior">‹ Anterior</button>' +
          '<span class="sv-pos" id="svPos"></span>' +
          '<button type="button" class="sv-btn pri" id="svAction" hidden></button>' +
          '<button type="button" class="sv-btn" id="svNext" aria-label="Próximo item">Próximo ›</button>' +
        '</div>' +
      '</div>';
    box = ov.querySelector('.sv-modal');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#svClose').addEventListener('click', function () { close(); });
    ov.querySelector('#svPrev').addEventListener('click', function () { step(-1); });
    ov.querySelector('#svNext').addEventListener('click', function () { step(1); });
    ov.querySelector('#svAction').addEventListener('click', function () { if (onAction) onAction(); });
    document.addEventListener('keydown', function (e) {
      if (!ov || !ov.parentNode) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft' && !/input|textarea|select/i.test(e.target.tagName)) step(-1);
      else if (e.key === 'ArrowRight' && !/input|textarea|select/i.test(e.target.tagName)) step(1);
      else if (e.key === 'Tab') trapFocus(e);
    });
  }

  function trapFocus(e) {
    var f = box.querySelectorAll('button:not([disabled]):not([hidden]), [href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function render() {
    var arr = lists[cur.kind] || [];
    var item = arr[cur.idx];
    if (!item) return;
    var k = KIND[cur.kind];
    var v;
    try { v = BUILD[cur.kind](item); }
    catch (e) { console.error('[SUP_VIEW]', e); v = { title: 'Não foi possível abrir', meta: '', body: text('', 'Erro ao montar os detalhes deste item.') }; }
    ov.querySelector('#svKind').textContent = k.icon + '  ' + k.name;
    ov.querySelector('#svTitle').innerHTML = v.title;
    ov.querySelector('#svMeta').innerHTML = v.meta;
    var body = ov.querySelector('#svBody');
    body.innerHTML = v.body;
    body.scrollTop = 0;
    ov.querySelector('#svPos').textContent = (cur.idx + 1) + ' de ' + arr.length;
    ov.querySelector('#svPrev').disabled = cur.idx <= 0;
    ov.querySelector('#svNext').disabled = cur.idx >= arr.length - 1;
    var act = ov.querySelector('#svAction');
    onAction = v.action ? v.action.fn : null;
    act.hidden = !v.action;
    if (v.action) act.textContent = v.action.label;
  }

  function step(d) {
    var arr = lists[cur.kind] || [];
    var n = cur.idx + d;
    if (n < 0 || n >= arr.length) return;
    cur.idx = n;
    render();
  }

  async function open(kind, id) {
    var arr = lists[kind] || [];
    var idx = -1;
    for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) { idx = i; break; }
    if (idx < 0) return;
    if (since === undefined && typeof winSeenSince === 'function') {
      try { since = await winSeenSince(); } catch (e) { since = null; }
    }
    ensure();
    cur = { kind: kind, idx: idx };
    lastFocus = document.activeElement;
    render();
    if (!ov.parentNode) document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { ov.classList.add('show'); ov.querySelector('#svClose').focus(); });
  }

  function close(skipFocus) {
    if (!ov || !ov.parentNode) return;
    ov.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 190);
    if (!skipFocus && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function setItems(kind, arr) { lists[kind] = arr || []; }

  // Clique (ou Enter/Espaço) em qualquer item marcado nas listas
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('.sv-click[data-sv]') : null;
    if (!el || e.target.closest('button, a, input, select, textarea')) return;
    open(el.getAttribute('data-sv'), el.getAttribute('data-id'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target && e.target.classList && e.target.classList.contains('sv-click') ? e.target : null;
    if (!el) return;
    e.preventDefault();
    open(el.getAttribute('data-sv'), el.getAttribute('data-id'));
  });

  // Helpers para as listas
  function attrs(kind, id) {
    return ' class="list-item sv-click" data-sv="' + kind + '" data-id="' + esc(id) + '" role="button" tabindex="0"';
  }
  async function seenSinceForLists() {
    if (since === undefined && typeof winSeenSince === 'function') {
      try { since = await winSeenSince(); } catch (e) { since = null; }
    }
    return since;
  }

  return { setItems: setItems, open: open, close: close, attrs: attrs, esc: esc, parseWr: parseWr, since: seenSinceForLists };
})();
