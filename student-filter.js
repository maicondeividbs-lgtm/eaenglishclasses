// ═══ FILTRO POR ALUNO ═══
// Usado nos dashboards do professor e da coordenação (Homework, Feedback,
// Redação, Pronúncia, Vocabulário).
//
// EA_STU.apply(listId, items, reload)
//   Cria (uma vez) uma barra de filtro no topo da seção, com todos os alunos
//   (os do seletor de envio da seção + os presentes nos itens), e devolve só
//   os itens do aluno escolhido. O aluno escolhido vale para todas as seções
//   e fica lembrado durante a sessão. Se não houver nada, desenha o aviso na
//   própria lista e devolve null.
// EA_STU.only(items, studentId)
//   Filtra sem criar barra (usado pelo filtro compartilhado da Supervisão).
(function () {
  var css =
    '.ea-stu-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 16px;padding:12px 16px;background:#fff;border:1.5px solid var(--g200,#E5E7EB);border-left:4px solid var(--orange,#D71920);border-radius:12px}' +
    '.ea-stu-bar.on{background:#FFF5F5;border-color:var(--orange,#D71920)}' +
    '.ea-stu-bar label{font-size:13px;font-weight:800;color:var(--navy,#0B1F33);white-space:nowrap}' +
    '.ea-stu-bar select{flex:1;min-width:180px;max-width:380px;padding:9px 12px;border:1.5px solid var(--g200,#E5E7EB);border-radius:10px;background:#fff;font-family:inherit;font-size:13.5px;color:var(--navy,#0B1F33);cursor:pointer;outline:none}' +
    '.ea-stu-bar select:focus{border-color:var(--orange,#D71920)}' +
    '.ea-stu-bar .ea-stu-info{font-size:12.5px;color:var(--g500,#6B7280);font-weight:600}' +
    '.ea-stu-bar .ea-stu-clear{border:0;background:none;color:var(--orange,#D71920);font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;padding:4px 2px}' +
    '@media(max-width:600px){.ea-stu-bar{padding:10px 12px}.ea-stu-bar select{max-width:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  var KEY = 'win-stu-filter';
  var cur = '';
  try { cur = sessionStorage.getItem(KEY) || ''; } catch (e) {}
  var names = {};   // id -> nome (todos os alunos já vistos)
  var lists = {};   // listId -> { reload, ids:{} }

  // Alunos de um item: [{id, name}]
  function studentsOf(it) {
    if (!it) return [];
    if (Array.isArray(it.task_submissions)) {
      return it.task_submissions.map(function (s) {
        return { id: s.student_id, name: (s.student && s.student.full_name) || '' };
      }).filter(function (s) { return s.id; });
    }
    if (it.student_id) return [{ id: it.student_id, name: (it.student && it.student.full_name) || '' }];
    return [];
  }

  function only(items, sid) {
    if (!sid || !Array.isArray(items)) return items;
    var out = [];
    items.forEach(function (it) {
      if (Array.isArray(it.task_submissions)) {
        var subs = it.task_submissions.filter(function (s) { return s.student_id === sid; });
        if (subs.length) out.push(Object.assign({}, it, { task_submissions: subs }));
      } else if (it.student_id === sid) out.push(it);
    });
    return out;
  }

  // Seção (ou aba da coordenação) que contém a lista
  function scopeOf(list) {
    return list.closest('.teach-pane') || list.closest('.section') || list.parentNode;
  }

  // Alunos do seletor de envio da própria seção
  function readSendSelect(listId) {
    var list = document.getElementById(listId);
    if (!list) return;
    var sc = scopeOf(list), sel = sc && sc.querySelector('.form-card select');
    if (!sel) return;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (!o.value) return;
      if (!names[o.value]) names[o.value] = o.textContent.replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Aluno';
      lists[listId].ids[o.value] = 1;
    });
  }

  function bar(listId) {
    var id = listId + '-stu';
    var el = document.getElementById(id);
    if (el) return el;
    var list = document.getElementById(listId);
    if (!list || !list.parentNode) return null;
    el = document.createElement('div');
    el.id = id; el.className = 'ea-stu-bar';
    el.innerHTML = '<label for="' + id + '-sel">👤 Ver só o material de</label><select id="' + id + '-sel"></select>' +
      '<span class="ea-stu-info"></span><button type="button" class="ea-stu-clear" style="display:none">Limpar filtro</button>';
    // Topo da seção, antes do formulário de envio
    var sc = scopeOf(list), form = sc && sc.querySelector('.form-card');
    var panel = list.closest('.panel');
    if (form && form.parentNode) form.parentNode.insertBefore(el, form);
    else if (panel && panel.parentNode) panel.parentNode.insertBefore(el, panel);
    else list.parentNode.insertBefore(el, list);
    var sel = el.querySelector('select'), clr = el.querySelector('.ea-stu-clear');
    sel.onfocus = sel.onmousedown = function () { readSendSelect(listId); fill(listId); };
    sel.onchange = function () { choose(sel.value); };
    clr.onclick = function () { choose(''); };
    return el;
  }

  function fill(listId) {
    var b = document.getElementById(listId + '-stu');
    if (!b) return;
    var ids = Object.keys(lists[listId].ids).sort(function (a, c) {
      return String(names[a]).localeCompare(String(names[c]), 'pt', { sensitivity: 'base' });
    });
    var sel = b.querySelector('select');
    var html = '<option value="">Todos os alunos (' + ids.length + ')</option>' +
      ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(names[id] || 'Aluno') + '</option>'; }).join('');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    sel.value = cur && lists[listId].ids[cur] ? cur : '';
    b.classList.toggle('on', !!cur);
    b.querySelector('.ea-stu-clear').style.display = cur ? '' : 'none';
  }

  // Escolha vale para todas as seções
  function choose(sid) {
    cur = sid || '';
    try { if (cur) sessionStorage.setItem(KEY, cur); else sessionStorage.removeItem(KEY); } catch (e) {}
    Object.keys(lists).forEach(function (lid) {
      var l = lists[lid];
      if (cur && !l.ids[cur] && names[cur]) l.ids[cur] = 1;
      if (typeof l.reload === 'function') { try { l.reload(); } catch (e) {} }
    });
  }

  function apply(listId, items, reload) {
    items = items || [];
    if (!lists[listId]) lists[listId] = { reload: reload, ids: {} };
    lists[listId].reload = reload;
    var b = bar(listId);
    if (!b) return items;

    items.forEach(function (it) {
      studentsOf(it).forEach(function (s) {
        if (s.name || !names[s.id]) names[s.id] = s.name || names[s.id] || 'Aluno';
        lists[listId].ids[s.id] = 1;
      });
    });
    readSendSelect(listId);
    if (cur && names[cur]) lists[listId].ids[cur] = 1;
    fill(listId);

    var info = b.querySelector('.ea-stu-info');
    if (!cur) { info.textContent = ''; return items; }
    var out = only(items, cur);
    info.textContent = out.length + (out.length === 1 ? ' item' : ' itens');
    if (!out.length) {
      var list = document.getElementById(listId);
      if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔎</div><p>Nada nesta seção para ' + esc(names[cur] || 'este aluno') + '.</p></div>';
      return null;
    }
    return out;
  }

  window.EA_STU = { apply: apply, only: only };
})();
