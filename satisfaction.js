/* ═══════════════════════════════════════════════════════════════
   PESQUISA DE SATISFAÇÃO — módulo compartilhado (EA English Classes)
   Eixo aluno → coordenação. O professor NÃO acessa (garantido por RLS).
   Depende do client global `db` (supabase.js) e de `showToast` (opcional).
   API:
     window.EA_SAT.mountCoord(container, currentUser)
     window.EA_SAT.mountStudent(container, currentUser)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TYPES = [
    { key: 'scale',         label: 'Escala (1–5)' },
    { key: 'single_choice', label: 'Múltipla escolha (uma opção)' },
    { key: 'multi_choice',  label: 'Múltipla escolha (várias)' },
    { key: 'short_text',    label: 'Resposta curta' },
    { key: 'long_text',     label: 'Resposta discursiva' },
    { key: 'comment',       label: 'Comentário aberto' }
  ];
  var SCOPES = [
    { key: 'teacher', label: 'Sobre o professor' },
    { key: 'school',  label: 'Sobre a escola' },
    { key: 'general', label: 'Geral' }
  ];
  var TYPE_LABEL = {}; TYPES.forEach(function (t) { TYPE_LABEL[t.key] = t.label; });

  // ── utils ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function uid() { return 'q' + Math.random().toString(36).slice(2, 9); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function phaseInfo(s) {
    var now = Date.now(), st = new Date(s.starts_at).getTime(), en = new Date(s.ends_at).getTime();
    if (!s.active) return { k: 'closed', label: 'Inativa' };
    if (now < st) return { k: 'scheduled', label: 'Agendada' };
    if (now > en) return { k: 'closed', label: 'Encerrada' };
    return { k: 'open', label: 'Aberta' };
  }
  function me(cu) { return cu || (typeof currentUser !== 'undefined' ? currentUser : null); }

  // ── CSS (injeta uma vez) ───────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sat-css')) return;
    var css = document.createElement('style');
    css.id = 'sat-css';
    css.textContent = [
      '.sat-wrap{max-width:1000px}',
      '.sat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}',
      '.sat-h2{font-family:Fraunces,Georgia,serif;font-size:22px;color:var(--navy);margin:0}',
      '.sat-btn{border:none;border-radius:11px;padding:10px 16px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.18s}',
      '.sat-btn.pri{background:linear-gradient(135deg,var(--orange),var(--mango));color:#fff;box-shadow:0 6px 16px -8px var(--orange)}',
      '.sat-btn.pri:hover{transform:translateY(-1px)}',
      '.sat-btn.gh{background:var(--g50,#f8fafc);color:var(--navy);border:1.5px solid var(--g100,#eef1f6)}',
      '.sat-btn.gh:hover{background:var(--navy);color:#fff;border-color:var(--navy)}',
      '.sat-btn.dg{background:#fee2e2;color:#b91c1c}',
      '.sat-btn.dg:hover{background:#dc2626;color:#fff}',
      '.sat-btn.sm{padding:7px 11px;font-size:12px;border-radius:9px}',
      '.sat-card{background:#fff;border:1.5px solid var(--g100,#eef1f6);border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 8px 30px -22px rgba(25,36,78,.4)}',
      '.sat-srow{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;justify-content:space-between}',
      '.sat-stitle{font-family:Fraunces,serif;font-size:18px;color:var(--navy);margin:0 0 3px}',
      '.sat-sdesc{color:var(--g500,#64748b);font-size:13px;margin:0 0 6px}',
      '.sat-meta{font-size:12px;color:var(--g500,#64748b);display:flex;gap:14px;flex-wrap:wrap}',
      '.sat-actions{display:flex;gap:7px;flex-wrap:wrap}',
      '.sat-badge{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:4px 10px;border-radius:999px}',
      '.sat-b-open{background:#dcfce7;color:#15803d}.sat-b-scheduled{background:#fef3c7;color:#a16207}.sat-b-closed{background:var(--g100,#eef1f6);color:var(--g600,#475569)}',
      '.sat-field{margin-bottom:13px}',
      '.sat-lbl{display:block;font-size:12px;font-weight:700;color:var(--g600,#475569);margin-bottom:5px}',
      '.sat-in,.sat-ta,.sat-sel{width:100%;padding:10px 12px;border:1.5px solid var(--g200,#dfe4ec);border-radius:10px;font-family:inherit;font-size:14px;color:var(--navy);background:var(--g50,#f8fafc)}',
      '.sat-in:focus,.sat-ta:focus,.sat-sel:focus{outline:none;border-color:var(--blue);background:#fff;box-shadow:0 0 0 3px rgba(37,60,150,.12)}',
      '.sat-ta{min-height:80px;resize:vertical}',
      '.sat-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:640px){.sat-grid2{grid-template-columns:1fr}}',
      '.sat-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--g600);margin:4px 0}',
      '.sat-teachers{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;max-height:180px;overflow:auto;border:1.5px solid var(--g100);border-radius:10px;padding:10px}',
      '.sat-q{border:1.5px solid var(--g100);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:#fff}',
      '.sat-q-top{display:flex;align-items:center;gap:10px;justify-content:space-between}',
      '.sat-q-num{width:26px;height:26px;border-radius:8px;background:var(--navy);color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.sat-q-label{font-weight:700;color:var(--navy);font-size:14px}',
      '.sat-q-tags{font-size:11px;color:var(--g500);margin-top:2px}',
      '.sat-q-mv{display:flex;gap:4px}',
      '.sat-modal{position:fixed;inset:0;background:rgba(25,36,78,.55);display:none;align-items:flex-start;justify-content:center;z-index:9999;padding:24px 14px;overflow:auto}',
      '.sat-modal.open{display:flex}',
      '.sat-box{background:#fff;border-radius:18px;max-width:640px;width:100%;padding:22px;box-shadow:0 30px 80px -20px rgba(25,36,78,.5);margin:auto}',
      '.sat-box h3{font-family:Fraunces,serif;font-size:20px;color:var(--navy);margin:0 0 14px}',
      '.sat-opt-row{display:flex;gap:6px;margin-bottom:6px}',
      '.sat-opt-row .sat-in{flex:1}',
      '.sat-empty{text-align:center;color:var(--g500);padding:30px;border:1.5px dashed var(--g200);border-radius:14px}',
      '.sat-res-teacher{border:1.5px solid var(--g100);border-radius:14px;padding:16px;margin-bottom:14px}',
      '.sat-res-tname{font-family:Fraunces,serif;font-size:16px;color:var(--navy);margin:0 0 2px}',
      '.sat-res-q{padding:10px 0;border-top:1px solid var(--g100)}',
      '.sat-res-q:first-child{border-top:none}',
      '.sat-res-ql{font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:5px}',
      '.sat-bar{height:8px;border-radius:5px;background:var(--g100);overflow:hidden;flex:1}',
      '.sat-bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--orange))}',
      '.sat-distrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--g600);margin:3px 0}',
      '.sat-distrow b{width:64px;flex-shrink:0}.sat-distrow em{width:34px;text-align:right;font-style:normal;color:var(--g500)}',
      '.sat-avg{display:inline-flex;align-items:baseline;gap:4px;font-family:Fraunces,serif;color:var(--orange)}',
      '.sat-avg b{font-size:26px}.sat-avg span{font-size:13px;color:var(--g500);font-family:"Plus Jakarta Sans",sans-serif}',
      '.sat-comment{background:var(--g50);border-left:3px solid var(--mango);border-radius:8px;padding:8px 12px;margin:6px 0;font-size:13px;color:var(--g700)}',
      '.sat-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#15803d;font-weight:700}',
      '.sat-live i{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:satpulse 1.4s infinite}',
      '@keyframes satpulse{0%,100%{opacity:1}50%{opacity:.3}}',
      '.sat-req{color:var(--orange)}',
      '.sat-scale{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}',
      '.sat-scale button{width:46px;height:46px;border-radius:12px;border:1.5px solid var(--g200);background:#fff;font-weight:800;font-size:16px;color:var(--navy);cursor:pointer;transition:.15s}',
      '.sat-scale button.on{background:var(--orange);border-color:var(--orange);color:#fff;transform:translateY(-2px)}',
      '.sat-choice{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1.5px solid var(--g200);border-radius:10px;margin:5px 0;cursor:pointer;font-size:14px}',
      '.sat-choice.on{border-color:var(--blue);background:var(--blue-soft,#e8ebf7)}',
      '.sat-choice input{accent-color:var(--blue)}'
    ].join('\n');
    document.head.appendChild(css);
  }

  // modal genérico
  function ensureModal() {
    var m = document.getElementById('satModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'satModal'; m.className = 'sat-modal';
    m.innerHTML = '<div class="sat-box" id="satBox"></div>';
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    return m;
  }
  function openModal(html) { ensureModal(); document.getElementById('satBox').innerHTML = html; document.getElementById('satModal').classList.add('open'); }
  function closeModal() { var m = document.getElementById('satModal'); if (m) m.classList.remove('open'); }

  // ════════════════════════════════════════════════════════════
  //  COORDENAÇÃO
  // ════════════════════════════════════════════════════════════
  var COORD = { cu: null, teachers: [], chan: null };

  async function mountCoord(container, cu) {
    injectCSS(); COORD.cu = me(cu);
    container.innerHTML =
      '<div class="sat-wrap">' +
        '<div class="sat-head"><h2 class="sat-h2">Pesquisa de Satisfação</h2>' +
          '<button class="sat-btn pri" id="satNew">+ Nova pesquisa</button></div>' +
        '<div id="satList"><div class="sat-empty">Carregando…</div></div>' +
      '</div>';
    container.querySelector('#satNew').onclick = function () { openSurveyEditor(null); };
    if (!COORD.teachers.length) {
      try {
        var r = await db.from('profiles').select('id, full_name').eq('role', 'teacher').eq('active', true).order('full_name');
        COORD.teachers = r.data || [];
      } catch (e) { COORD.teachers = []; }
    }
    await loadSurveyList();
  }

  async function loadSurveyList() {
    var box = document.getElementById('satList'); if (!box) return;
    var r = await db.from('satisfaction_surveys')
      .select('*, satisfaction_responses(count)')
      .order('created_at', { ascending: false });
    if (r.error) { box.innerHTML = '<div class="sat-empty">Erro ao carregar pesquisas.</div>'; return; }
    var rows = r.data || [];
    if (!rows.length) { box.innerHTML = '<div class="sat-empty">Nenhuma pesquisa ainda. Crie a primeira em “Nova pesquisa”.</div>'; return; }
    box.innerHTML = rows.map(function (s) {
      var p = phaseInfo(s);
      var count = (s.satisfaction_responses && s.satisfaction_responses[0] && s.satisfaction_responses[0].count) || 0;
      return '<div class="sat-card"><div class="sat-srow"><div style="flex:1;min-width:220px">' +
        '<div class="sat-stitle">' + esc(s.title) + '</div>' +
        (s.description ? '<div class="sat-sdesc">' + esc(s.description) + '</div>' : '') +
        '<div class="sat-meta"><span>🗓️ ' + fmtDate(s.starts_at) + ' → ' + fmtDate(s.ends_at) + '</span>' +
          '<span>✉️ ' + count + ' resposta' + (count === 1 ? '' : 's') + '</span></div></div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">' +
          '<span class="sat-badge sat-b-' + p.k + '">' + p.label + '</span>' +
          '<div class="sat-actions">' +
            '<button class="sat-btn gh sm" data-res="' + s.id + '">📊 Resultados</button>' +
            '<button class="sat-btn gh sm" data-q="' + s.id + '">📝 Perguntas</button>' +
            '<button class="sat-btn gh sm" data-ed="' + s.id + '">Editar</button>' +
            '<button class="sat-btn dg sm" data-del="' + s.id + '">Excluir</button>' +
          '</div></div></div></div>';
    }).join('');
    box.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { openSurveyEditor(rows.find(function (x) { return x.id === b.dataset.ed; })); }; });
    box.querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { openQuestions(rows.find(function (x) { return x.id === b.dataset.q; })); }; });
    box.querySelectorAll('[data-res]').forEach(function (b) { b.onclick = function () { openResults(rows.find(function (x) { return x.id === b.dataset.res; })); }; });
    box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { deleteSurvey(b.dataset.del); }; });
  }

  function openSurveyEditor(s) {
    var isNew = !s; s = s || {};
    var checked = {};
    if (!isNew) {
      // carrega professores vinculados
      db.from('satisfaction_survey_teachers').select('teacher_id').eq('survey_id', s.id).then(function (r) {
        (r.data || []).forEach(function (x) {
          var cb = document.querySelector('#satTeachers input[value="' + x.teacher_id + '"]');
          if (cb) cb.checked = true;
        });
      });
    }
    var teacherBoxes = COORD.teachers.map(function (t) {
      return '<label class="sat-chk"><input type="checkbox" value="' + t.id + '"> ' + esc(t.full_name) + '</label>';
    }).join('') || '<span style="color:var(--g500);font-size:12px">Nenhum professor cadastrado.</span>';
    openModal(
      '<h3>' + (isNew ? 'Nova pesquisa' : 'Editar pesquisa') + '</h3>' +
      '<div class="sat-field"><label class="sat-lbl">Título *</label><input class="sat-in" id="satTitle" value="' + esc(s.title || '') + '"></div>' +
      '<div class="sat-field"><label class="sat-lbl">Descrição</label><textarea class="sat-ta" id="satDesc">' + esc(s.description || '') + '</textarea></div>' +
      '<div class="sat-grid2">' +
        '<div class="sat-field"><label class="sat-lbl">Início *</label><input type="datetime-local" class="sat-in" id="satStart" value="' + toLocalInput(s.starts_at) + '"></div>' +
        '<div class="sat-field"><label class="sat-lbl">Fim *</label><input type="datetime-local" class="sat-in" id="satEnd" value="' + toLocalInput(s.ends_at) + '"></div>' +
      '</div>' +
      '<div class="sat-field"><label class="sat-chk"><input type="checkbox" id="satActive" ' + (isNew || s.active ? 'checked' : '') + '> Pesquisa ativa</label></div>' +
      '<div class="sat-field"><label class="sat-lbl">Professores vinculados <span style="font-weight:500;color:var(--g500)">(nenhum marcado = todos os alunos)</span></label>' +
        '<div class="sat-teachers" id="satTeachers">' + teacherBoxes + '</div></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
        '<button class="sat-btn gh" id="satCancel">Cancelar</button>' +
        '<button class="sat-btn pri" id="satSave">Salvar</button></div>'
    );
    document.getElementById('satCancel').onclick = closeModal;
    document.getElementById('satSave').onclick = function () { saveSurvey(isNew ? null : s.id); };
  }

  async function saveSurvey(id) {
    var title = document.getElementById('satTitle').value.trim();
    var starts = document.getElementById('satStart').value;
    var ends = document.getElementById('satEnd').value;
    if (!title || !starts || !ends) { toast('Preencha título, início e fim.'); return; }
    if (new Date(ends) <= new Date(starts)) { toast('O fim deve ser depois do início.'); return; }
    var payload = {
      title: title,
      description: document.getElementById('satDesc').value.trim() || null,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(ends).toISOString(),
      active: document.getElementById('satActive').checked
    };
    var savedId = id;
    try {
      if (id) {
        var u = await db.from('satisfaction_surveys').update(payload).eq('id', id).select('id').single();
        if (u.error) throw u.error;
      } else {
        payload.created_by = COORD.cu ? COORD.cu.id : null;
        payload.phase = 'scheduled';
        var c = await db.from('satisfaction_surveys').insert(payload).select('id').single();
        if (c.error) throw c.error; savedId = c.data.id;
      }
      // sincroniza professores vinculados
      var chosen = Array.prototype.slice.call(document.querySelectorAll('#satTeachers input:checked')).map(function (x) { return x.value; });
      await db.from('satisfaction_survey_teachers').delete().eq('survey_id', savedId);
      if (chosen.length) {
        await db.from('satisfaction_survey_teachers').insert(chosen.map(function (tid) { return { survey_id: savedId, teacher_id: tid }; }));
      }
      toast(id ? 'Pesquisa atualizada.' : 'Pesquisa criada.');
      closeModal(); await loadSurveyList();
      if (!id) openQuestions({ id: savedId, title: title });
    } catch (e) { toast('Erro ao salvar a pesquisa.'); }
  }

  async function deleteSurvey(id) {
    if (!window.confirm('Excluir esta pesquisa e todas as respostas? Esta ação não pode ser desfeita.')) return;
    var r = await db.from('satisfaction_surveys').delete().eq('id', id);
    if (r.error) { toast('Erro ao excluir.'); return; }
    toast('Pesquisa excluída.'); await loadSurveyList();
  }

  // ── Perguntas ──────────────────────────────────────────────────
  var QSTATE = { survey: null, items: [] };

  async function openQuestions(survey) {
    QSTATE.survey = survey;
    var r = await db.from('satisfaction_questions').select('*').eq('survey_id', survey.id).order('sort_order');
    QSTATE.items = (r.data || []).map(normQ);
    renderQuestions();
  }
  function normQ(q) {
    return { id: q.id, type: q.type, label: q.label, help_text: q.help_text || '',
      options: q.options || (q.type === 'scale' ? { min: 1, max: 5 } : []),
      required: !!q.required, scope: q.scope || 'teacher', sort_order: q.sort_order || 0 };
  }
  function renderQuestions() {
    var list = QSTATE.items.map(function (q, i) {
      var tags = TYPE_LABEL[q.type] + ' · ' + (SCOPES.find(function (x) { return x.key === q.scope; }) || {}).label + (q.required ? ' · obrigatória' : '');
      return '<div class="sat-q"><div class="sat-q-top"><div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span class="sat-q-num">' + (i + 1) + '</span><div><div class="sat-q-label">' + esc(q.label) + '</div>' +
        '<div class="sat-q-tags">' + esc(tags) + '</div></div></div>' +
        '<div class="sat-q-mv">' +
          '<button class="sat-btn gh sm" data-up="' + i + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button class="sat-btn gh sm" data-down="' + i + '" ' + (i === QSTATE.items.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button class="sat-btn gh sm" data-qed="' + i + '">✎</button>' +
          '<button class="sat-btn dg sm" data-qdel="' + i + '">✕</button>' +
        '</div></div></div>';
    }).join('') || '<div class="sat-empty">Nenhuma pergunta ainda.</div>';
    openModal(
      '<h3>Perguntas — ' + esc(QSTATE.survey.title || '') + '</h3>' +
      '<div id="satQList">' + list + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">' +
        '<button class="sat-btn pri" id="satQAdd">+ Adicionar pergunta</button>' +
        '<button class="sat-btn gh" id="satQClose">Fechar</button></div>'
    );
    document.getElementById('satQAdd').onclick = function () { editQuestion(-1); };
    document.getElementById('satQClose').onclick = function () { closeModal(); loadSurveyList(); };
    var box = document.getElementById('satQList');
    box.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { moveQ(+b.dataset.up, -1); }; });
    box.querySelectorAll('[data-down]').forEach(function (b) { b.onclick = function () { moveQ(+b.dataset.down, 1); }; });
    box.querySelectorAll('[data-qed]').forEach(function (b) { b.onclick = function () { editQuestion(+b.dataset.qed); }; });
    box.querySelectorAll('[data-qdel]').forEach(function (b) { b.onclick = function () { delQuestion(+b.dataset.qdel); }; });
  }
  async function moveQ(i, dir) {
    var j = i + dir; if (j < 0 || j >= QSTATE.items.length) return;
    var a = QSTATE.items[i], b = QSTATE.items[j];
    QSTATE.items[i] = b; QSTATE.items[j] = a;
    await persistOrder(); renderQuestions();
  }
  async function persistOrder() {
    await Promise.all(QSTATE.items.map(function (q, idx) {
      q.sort_order = idx;
      return db.from('satisfaction_questions').update({ sort_order: idx }).eq('id', q.id);
    }));
  }
  function editQuestion(idx) {
    var isNew = idx < 0;
    var q = isNew ? { type: 'scale', label: '', help_text: '', options: { min: 1, max: 5 }, required: false, scope: 'teacher' } : QSTATE.items[idx];
    var typeSel = TYPES.map(function (t) { return '<option value="' + t.key + '"' + (q.type === t.key ? ' selected' : '') + '>' + t.label + '</option>'; }).join('');
    var scopeSel = SCOPES.map(function (t) { return '<option value="' + t.key + '"' + (q.scope === t.key ? ' selected' : '') + '>' + t.label + '</option>'; }).join('');
    openModal(
      '<h3>' + (isNew ? 'Nova pergunta' : 'Editar pergunta') + '</h3>' +
      '<div class="sat-field"><label class="sat-lbl">Enunciado *</label><textarea class="sat-ta" id="satQLabel">' + esc(q.label) + '</textarea></div>' +
      '<div class="sat-field"><label class="sat-lbl">Texto de apoio (opcional)</label><input class="sat-in" id="satQHelp" value="' + esc(q.help_text) + '"></div>' +
      '<div class="sat-grid2">' +
        '<div class="sat-field"><label class="sat-lbl">Tipo</label><select class="sat-sel" id="satQType">' + typeSel + '</select></div>' +
        '<div class="sat-field"><label class="sat-lbl">Refere-se a</label><select class="sat-sel" id="satQScope">' + scopeSel + '</select></div>' +
      '</div>' +
      '<div id="satQOpts"></div>' +
      '<div class="sat-field"><label class="sat-chk"><input type="checkbox" id="satQReq" ' + (q.required ? 'checked' : '') + '> Resposta obrigatória</label></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">' +
        '<button class="sat-btn gh" id="satQCancel">Cancelar</button>' +
        '<button class="sat-btn pri" id="satQSave">Salvar pergunta</button></div>'
    );
    var typeEl = document.getElementById('satQType');
    function renderOpts() {
      var t = typeEl.value, box = document.getElementById('satQOpts');
      if (t === 'scale') {
        var o = q.options && q.options.min != null ? q.options : { min: 1, max: 5, min_label: '', max_label: '' };
        box.innerHTML = '<div class="sat-grid2">' +
          '<div class="sat-field"><label class="sat-lbl">Mínimo</label><input type="number" class="sat-in" id="scMin" value="' + (o.min != null ? o.min : 1) + '"></div>' +
          '<div class="sat-field"><label class="sat-lbl">Máximo</label><input type="number" class="sat-in" id="scMax" value="' + (o.max != null ? o.max : 5) + '"></div>' +
          '<div class="sat-field"><label class="sat-lbl">Rótulo do mínimo</label><input class="sat-in" id="scMinL" value="' + esc(o.min_label || '') + '"></div>' +
          '<div class="sat-field"><label class="sat-lbl">Rótulo do máximo</label><input class="sat-in" id="scMaxL" value="' + esc(o.max_label || '') + '"></div></div>';
      } else if (t === 'single_choice' || t === 'multi_choice') {
        var opts = Array.isArray(q.options) ? q.options.slice() : [];
        if (!opts.length) opts = ['', ''];
        box.innerHTML = '<div class="sat-field"><label class="sat-lbl">Opções</label><div id="scOpts">' +
          opts.map(function (op) { return optRow(op); }).join('') + '</div>' +
          '<button class="sat-btn gh sm" id="scAddOpt" style="margin-top:6px">+ opção</button></div>';
        document.getElementById('scAddOpt').onclick = function () {
          document.getElementById('scOpts').insertAdjacentHTML('beforeend', optRow(''));
          bindOptRemove();
        };
        bindOptRemove();
      } else { box.innerHTML = ''; }
    }
    function optRow(v) { return '<div class="sat-opt-row"><input class="sat-in sc-opt" value="' + esc(v) + '"><button class="sat-btn dg sm sc-rm">✕</button></div>'; }
    function bindOptRemove() {
      document.querySelectorAll('#scOpts .sc-rm').forEach(function (b) { b.onclick = function () { b.closest('.sat-opt-row').remove(); }; });
    }
    typeEl.onchange = renderOpts; renderOpts();
    document.getElementById('satQCancel').onclick = function () { renderQuestions(); };
    document.getElementById('satQSave').onclick = function () { saveQuestion(idx); };
  }
  async function saveQuestion(idx) {
    var label = document.getElementById('satQLabel').value.trim();
    if (!label) { toast('Escreva o enunciado.'); return; }
    var type = document.getElementById('satQType').value;
    var options = [];
    if (type === 'scale') {
      options = { min: parseInt(document.getElementById('scMin').value, 10) || 1,
        max: parseInt(document.getElementById('scMax').value, 10) || 5,
        min_label: document.getElementById('scMinL').value.trim(),
        max_label: document.getElementById('scMaxL').value.trim() };
    } else if (type === 'single_choice' || type === 'multi_choice') {
      options = Array.prototype.slice.call(document.querySelectorAll('#scOpts .sc-opt'))
        .map(function (i) { return i.value.trim(); }).filter(Boolean);
      if (options.length < 2) { toast('Adicione ao menos 2 opções.'); return; }
    }
    var rec = { survey_id: QSTATE.survey.id, type: type, label: label,
      help_text: document.getElementById('satQHelp').value.trim() || null,
      options: options, required: document.getElementById('satQReq').checked,
      scope: document.getElementById('satQScope').value };
    try {
      if (idx < 0) {
        rec.sort_order = QSTATE.items.length;
        var c = await db.from('satisfaction_questions').insert(rec).select('*').single();
        if (c.error) throw c.error; QSTATE.items.push(normQ(c.data));
      } else {
        var id = QSTATE.items[idx].id;
        var u = await db.from('satisfaction_questions').update(rec).eq('id', id).select('*').single();
        if (u.error) throw u.error; QSTATE.items[idx] = normQ(u.data);
      }
      toast('Pergunta salva.'); renderQuestions();
    } catch (e) { toast('Erro ao salvar a pergunta.'); }
  }
  async function delQuestion(idx) {
    var q = QSTATE.items[idx]; if (!q) return;
    if (!window.confirm('Excluir esta pergunta?')) return;
    var r = await db.from('satisfaction_questions').delete().eq('id', q.id);
    if (r.error) { toast('Erro ao excluir.'); return; }
    QSTATE.items.splice(idx, 1); await persistOrder(); renderQuestions();
  }

  // ── Resultados (tempo real, por professor) ─────────────────────
  async function openResults(survey) {
    openModal('<h3>Resultados — ' + esc(survey.title) + '</h3>' +
      '<div class="sat-head"><span class="sat-live"><i></i> Ao vivo</span>' +
      '<button class="sat-btn gh sm" id="satResClose">Fechar</button></div>' +
      '<div id="satResBody"><div class="sat-empty">Carregando…</div></div>');
    document.getElementById('satResClose').onclick = function () { stopResultsRealtime(); renderQuestions ? null : null; closeModal(); loadSurveyList(); };
    ensureModal().addEventListener('click', function once(e) {
      if (e.target.id === 'satModal') { stopResultsRealtime(); ensureModal().removeEventListener('click', once); }
    });
    await renderResults(survey);
    startResultsRealtime(survey);
  }
  function startResultsRealtime(survey) {
    stopResultsRealtime();
    try {
      COORD.chan = db.channel('sat-res-' + survey.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'satisfaction_responses', filter: 'survey_id=eq.' + survey.id }, function () { renderResults(survey); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'satisfaction_answers' }, function () { renderResults(survey); })
        .subscribe();
    } catch (e) {}
  }
  function stopResultsRealtime() { if (COORD.chan) { try { db.removeChannel(COORD.chan); } catch (e) {} COORD.chan = null; } }

  async function renderResults(survey) {
    var body = document.getElementById('satResBody'); if (!body) return;
    var qr = await db.from('satisfaction_questions').select('*').eq('survey_id', survey.id).order('sort_order');
    var questions = (qr.data || []).map(normQ);
    var rr = await db.from('satisfaction_responses')
      .select('id, teacher_id, submitted_at, teacher:teacher_id(full_name), satisfaction_answers(question_id, value_num, value_text, value_options)')
      .eq('survey_id', survey.id);
    var responses = rr.data || [];
    if (!questions.length) { body.innerHTML = '<div class="sat-empty">Esta pesquisa ainda não tem perguntas.</div>'; return; }
    if (!responses.length) { body.innerHTML = '<div class="sat-empty">Nenhuma resposta ainda.</div>'; return; }

    // agrupa respostas por professor (scope teacher) + bloco geral (school/general)
    var byTeacher = {};
    responses.forEach(function (r) {
      var key = r.teacher_id || 'sem-professor';
      var name = (r.teacher && r.teacher.full_name) || 'Sem professor vinculado';
      if (!byTeacher[key]) byTeacher[key] = { name: name, resp: [] };
      byTeacher[key].resp.push(r);
    });
    var teacherQs = questions.filter(function (q) { return q.scope === 'teacher'; });
    var generalQs = questions.filter(function (q) { return q.scope !== 'teacher'; });

    var html = '<div class="sat-meta" style="margin-bottom:12px"><span>👥 ' + responses.length + ' respostas</span><span>👩‍🏫 ' + Object.keys(byTeacher).length + ' professor(es)</span></div>';

    Object.keys(byTeacher).forEach(function (k) {
      var t = byTeacher[k];
      html += '<div class="sat-res-teacher"><div class="sat-res-tname">' + esc(t.name) + '</div>' +
        '<div class="sat-meta" style="margin-bottom:6px"><span>' + t.resp.length + ' resposta' + (t.resp.length === 1 ? '' : 's') + '</span></div>' +
        teacherQs.map(function (q) { return renderQAgg(q, t.resp); }).join('') + '</div>';
    });
    if (generalQs.length) {
      html += '<div class="sat-res-teacher"><div class="sat-res-tname">Escola / Geral</div>' +
        generalQs.map(function (q) { return renderQAgg(q, responses); }).join('') + '</div>';
    }
    body.innerHTML = html;
  }

  function ansFor(resp, qid) {
    var out = [];
    resp.forEach(function (r) {
      (r.satisfaction_answers || []).forEach(function (a) { if (a.question_id === qid) out.push(a); });
    });
    return out;
  }
  function renderQAgg(q, resp) {
    var ans = ansFor(resp, q.id);
    var head = '<div class="sat-res-q"><div class="sat-res-ql">' + esc(q.label) + '</div>';
    if (!ans.length) return head + '<div style="font-size:12px;color:var(--g400)">sem respostas</div></div>';
    if (q.type === 'scale') {
      var nums = ans.map(function (a) { return Number(a.value_num); }).filter(function (n) { return !isNaN(n); });
      var avg = nums.reduce(function (s, n) { return s + n; }, 0) / (nums.length || 1);
      var min = (q.options && q.options.min) || 1, max = (q.options && q.options.max) || 5;
      var dist = '';
      for (var v = min; v <= max; v++) {
        var c = nums.filter(function (n) { return n === v; }).length;
        var pct = Math.round((c / nums.length) * 100);
        dist += '<div class="sat-distrow"><b>' + v + '</b><div class="sat-bar"><span style="width:' + pct + '%"></span></div><em>' + c + '</em></div>';
      }
      return head + '<div class="sat-avg"><b>' + avg.toFixed(1) + '</b><span>/ ' + max + ' · ' + nums.length + ' resp.</span></div>' + dist + '</div>';
    }
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      var counts = {};
      ans.forEach(function (a) {
        var vals = q.type === 'multi_choice' ? (a.value_options || []) : (a.value_text != null ? [a.value_text] : []);
        vals.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
      });
      var total = ans.length;
      var rows = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (opt) {
        var pct = Math.round((counts[opt] / total) * 100);
        return '<div class="sat-distrow"><b style="width:auto;min-width:80px">' + esc(opt) + '</b><div class="sat-bar"><span style="width:' + pct + '%"></span></div><em>' + counts[opt] + '</em></div>';
      }).join('');
      return head + rows + '</div>';
    }
    // texto / comentário
    var texts = ans.map(function (a) { return a.value_text; }).filter(Boolean);
    return head + texts.map(function (t) { return '<div class="sat-comment">' + esc(t) + '</div>'; }).join('') + '</div>';
  }

  // ════════════════════════════════════════════════════════════
  //  ALUNO
  // ════════════════════════════════════════════════════════════
  async function mountStudent(container, cu) {
    injectCSS();
    var user = me(cu);
    container.innerHTML = '<div class="sat-wrap"><div class="sat-head"><h2 class="sat-h2">Pesquisa de Satisfação</h2></div><div id="satStuBody"><div class="sat-empty">Carregando…</div></div></div>';
    var body = container.querySelector('#satStuBody');
    // RLS já devolve só as pesquisas visíveis (ativas, no período e no targeting)
    var r = await db.from('satisfaction_surveys').select('*').order('ends_at', { ascending: true });
    var surveys = (r.data || []).filter(function (s) { return phaseInfo(s).k === 'open'; });
    if (!surveys.length) { body.innerHTML = '<div class="sat-empty">Nenhuma pesquisa disponível no momento. 🙂</div>'; return; }
    // verifica quais já foram respondidas
    var ids = surveys.map(function (s) { return s.id; });
    var done = {};
    try {
      var dr = await db.from('satisfaction_responses').select('survey_id').in('survey_id', ids);
      (dr.data || []).forEach(function (x) { done[x.survey_id] = true; });
    } catch (e) {}
    body.innerHTML = surveys.map(function (s) {
      return '<div class="sat-card"><div class="sat-stitle">' + esc(s.title) + '</div>' +
        (s.description ? '<div class="sat-sdesc">' + esc(s.description) + '</div>' : '') +
        '<div class="sat-meta" style="margin:6px 0 12px"><span>Disponível até ' + fmtDate(s.ends_at) + '</span></div>' +
        (done[s.id]
          ? '<div class="sat-badge sat-b-open">✓ Você já respondeu</div>'
          : '<button class="sat-btn pri" data-open="' + s.id + '">Responder agora</button>') +
        '</div>';
    }).join('');
    body.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = function () { openStudentForm(surveys.find(function (x) { return x.id === b.dataset.open; })); };
    });
  }

  async function openStudentForm(survey) {
    var qr = await db.from('satisfaction_questions').select('*').eq('survey_id', survey.id).order('sort_order');
    var questions = (qr.data || []).map(normQ);
    if (!questions.length) { toast('Esta pesquisa ainda não tem perguntas.'); return; }
    var fields = questions.map(function (q, i) { return renderStudentField(q, i); }).join('');
    openModal(
      '<h3>' + esc(survey.title) + '</h3>' +
      (survey.description ? '<p class="sat-sdesc">' + esc(survey.description) + '</p>' : '') +
      '<form id="satStuForm">' + fields + '</form>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
        '<button class="sat-btn gh" id="satStuCancel">Cancelar</button>' +
        '<button class="sat-btn pri" id="satStuSend">Enviar respostas</button></div>'
    );
    // interações (escala e choice)
    document.querySelectorAll('#satStuForm .sat-scale button').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var wrap = b.closest('.sat-scale');
        wrap.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); wrap.dataset.value = b.dataset.v;
      };
    });
    document.querySelectorAll('#satStuForm .sat-choice').forEach(function (c) {
      c.onclick = function (e) {
        if (e.target.tagName === 'INPUT') return;
        var inp = c.querySelector('input'); inp.checked = inp.type === 'radio' ? true : !inp.checked;
        syncChoice(c);
      };
      c.querySelector('input').onchange = function () { syncChoice(c); };
    });
    function syncChoice(c) {
      var group = c.closest('[data-qwrap]');
      group.querySelectorAll('.sat-choice').forEach(function (x) { x.classList.toggle('on', x.querySelector('input').checked); });
    }
    document.getElementById('satStuCancel').onclick = function () { mountAgainStudent(); };
    document.getElementById('satStuSend').onclick = function () { submitStudent(survey, questions); };
  }

  function renderStudentField(q, i) {
    var req = q.required ? ' <span class="sat-req">*</span>' : '';
    var help = q.help_text ? '<div style="font-size:12px;color:var(--g500);margin-bottom:6px">' + esc(q.help_text) + '</div>' : '';
    var inner = '';
    if (q.type === 'scale') {
      var min = (q.options && q.options.min) || 1, max = (q.options && q.options.max) || 5, btns = '';
      for (var v = min; v <= max; v++) btns += '<button type="button" data-v="' + v + '">' + v + '</button>';
      var labels = (q.options && (q.options.min_label || q.options.max_label))
        ? '<div class="sat-meta" style="margin-top:4px"><span>' + esc(q.options.min_label || '') + '</span><span>' + esc(q.options.max_label || '') + '</span></div>' : '';
      inner = '<div class="sat-scale" data-qwrap data-qid="' + q.id + '" data-type="scale">' + btns + '</div>' + labels;
    } else if (q.type === 'single_choice' || q.type === 'multi_choice') {
      var isMulti = q.type === 'multi_choice';
      inner = '<div data-qwrap data-qid="' + q.id + '" data-type="' + q.type + '">' +
        (q.options || []).map(function (op) {
          return '<label class="sat-choice"><input type="' + (isMulti ? 'checkbox' : 'radio') + '" name="opt_' + q.id + '" value="' + esc(op) + '"><span>' + esc(op) + '</span></label>';
        }).join('') + '</div>';
    } else if (q.type === 'short_text') {
      inner = '<input class="sat-in" data-qwrap data-qid="' + q.id + '" data-type="short_text">';
    } else {
      inner = '<textarea class="sat-ta" data-qwrap data-qid="' + q.id + '" data-type="' + q.type + '"></textarea>';
    }
    return '<div class="sat-field"><label class="sat-lbl">' + (i + 1) + '. ' + esc(q.label) + req + '</label>' + help + inner + '</div>';
  }

  function collectAnswers(questions) {
    var answers = [], missing = false;
    questions.forEach(function (q) {
      var el = document.querySelector('[data-qwrap][data-qid="' + q.id + '"]');
      var a = { question_id: q.id };
      var has = false;
      if (q.type === 'scale') {
        if (el.dataset.value) { a.value_num = el.dataset.value; has = true; }
      } else if (q.type === 'single_choice') {
        var sel = el.querySelector('input:checked'); if (sel) { a.value_text = sel.value; has = true; }
      } else if (q.type === 'multi_choice') {
        var chosen = Array.prototype.slice.call(el.querySelectorAll('input:checked')).map(function (x) { return x.value; });
        if (chosen.length) { a.value_options = chosen; has = true; }
      } else {
        var v = el.value.trim(); if (v) { a.value_text = v; has = true; }
      }
      if (q.required && !has) missing = true;
      if (has) answers.push(a);
    });
    return { answers: answers, missing: missing };
  }

  async function submitStudent(survey, questions) {
    var res = collectAnswers(questions);
    if (res.missing) { toast('Responda todas as perguntas obrigatórias (*).'); return; }
    var btn = document.getElementById('satStuSend'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    try {
      var r = await db.rpc('submit_satisfaction_response', { p_survey: survey.id, p_answers: res.answers });
      if (r.error) throw r.error;
      toast('Obrigado! Sua resposta foi enviada.');
      closeModal(); mountAgainStudent();
    } catch (e) {
      var msg = (e && e.message) || '';
      if (/already_responded/.test(msg)) toast('Você já respondeu esta pesquisa.');
      else if (/not_available/.test(msg)) toast('Esta pesquisa não está mais disponível.');
      else toast('Erro ao enviar. Tente novamente.');
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar respostas'; }
    }
  }
  function mountAgainStudent() {
    var sec = document.getElementById('sec-satisfaction');
    if (sec) mountStudent(sec, me(null));
  }

  window.EA_SAT = { mountCoord: mountCoord, mountStudent: mountStudent, closeModal: closeModal };
})();
