// ═══ FILTRO POR ALUNO ═══
// Usado nos dashboards do professor e da coordenação (Homework, Feedback,
// Redação, Pronúncia, Vocabulário).
//
// EA_STU.apply(listId, items, reload)
//   Cria (uma vez) uma faixa de "chips" com os alunos dentro do painel da lista
//   e devolve só os itens do aluno escolhido. O aluno escolhido vale para todas
//   as seções e fica lembrado durante a sessão. Se não houver nada, desenha o
//   aviso na própria lista e devolve null.
// EA_STU.only(items, studentId)
//   Filtra sem criar barra (usado pelo filtro compartilhado da Supervisão).
(function () {
  var css =
    '.ea-stu-bar{margin:6px 16px 2px;padding:12px 0 10px;border-bottom:1px solid #EEF1F4}' +
    '.ea-stu-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}' +
    '.ea-stu-title{font-size:13px;font-weight:700;color:#0B1F33}' +
    '.ea-stu-info{font-size:12.5px;color:#6F8FA8;font-weight:600}' +
    '.ea-stu-q{margin-left:auto;width:190px;max-width:100%;padding:7px 12px 7px 32px;border:1px solid #D8DEDD;border-radius:999px;font:inherit;font-size:13px;color:#0B1F33;outline:none;' +
      'background:#F5F7FA url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236F8FA8\' stroke-width=\'2.4\' stroke-linecap=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'7\'/%3E%3Cpath d=\'m20 20-3.5-3.5\'/%3E%3C/svg%3E") no-repeat 11px center}' +
    '.ea-stu-q:focus{border-color:#6F8FA8;background-color:#fff}' +
    '.ea-stu-chips{display:flex;flex-wrap:wrap;gap:8px}' +
    '.ea-chip{display:inline-flex;align-items:center;gap:7px;max-width:220px;padding:5px 13px 5px 5px;border:1px solid #D8DEDD;border-radius:999px;background:#fff;color:#0B1F33;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s,color .15s}' +
    '.ea-chip:hover{border-color:#6F8FA8;background:#F5F7FA}' +
    '.ea-chip:focus-visible{outline:2px solid #6F8FA8;outline-offset:2px}' +
    '.ea-chip i{flex:none;width:24px;height:24px;border-radius:50%;background:#E8EEF3;color:#0B1F33;font-style:normal;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
    '.ea-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ea-chip.all{padding-left:13px}' +
    '.ea-chip[aria-pressed="true"]{background:#0B1F33;border-color:#0B1F33;color:#fff}' +
    '.ea-chip[aria-pressed="true"] i{background:#D71920;color:#fff}' +
    '.ea-chip[hidden]{display:none}' +
    '@media(max-width:600px){.ea-stu-bar{margin:4px 12px 0}.ea-stu-q{margin-left:0;width:100%}' +
      '.ea-stu-chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.ea-stu-chips::-webkit-scrollbar{display:none}.ea-chip{flex:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function initials(n) {
    var p = String(n || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function shortName(n) {
    var p = String(n || 'Aluno').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0];
  }

  var KEY = 'win-stu-filter';
  var cur = '';
  try { cur = sessionStorage.getItem(KEY) || ''; } catch (e) {}
  var names = {};   // id -> nome (todos os alunos já vistos)
  var lists = {};   // listId -> { reload, ids:{}, count }

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
    el.innerHTML = '<div class="ea-stu-top"><span class="ea-stu-title">Mostrar de</span><span class="ea-stu-info"></span>' +
      '<input type="search" class="ea-stu-q" placeholder="Buscar aluno" aria-label="Buscar aluno" hidden></div>' +
      '<div class="ea-stu-chips" role="group" aria-label="Filtrar lista por aluno"></div>';
    // Dentro do painel da lista (logo abaixo do título), longe do formulário de envio
    var sc = scopeOf(list);
    var panel = list.closest('.panel'), head = panel && panel.querySelector('.panel-head');
    if (head && head.parentNode === panel) panel.insertBefore(el, head.nextSibling);
    else list.parentNode.insertBefore(el, list);

    el.querySelector('.ea-stu-chips').addEventListener('click', function (e) {
      var c = e.target.closest('.ea-chip'); if (!c) return;
      choose(c.getAttribute('data-id') === cur ? '' : c.getAttribute('data-id'));
    });
    el.querySelector('.ea-stu-q').addEventListener('input', function () { search(el, this.value); });
    // Quando o seletor de envio da seção termina de carregar, atualiza os alunos
    var send = sc && sc.querySelector('.form-card select');
    if (send && window.MutationObserver) {
      new MutationObserver(function () { readSendSelect(listId); fill(listId); })
        .observe(send, { childList: true });
    }
    return el;
  }

  function search(b, q) {
    q = norm(q);
    b.querySelectorAll('.ea-chip[data-id]:not(.all)').forEach(function (c) {
      c.hidden = !!q && norm(c.getAttribute('data-name')).indexOf(q) < 0 && c.getAttribute('data-id') !== cur;
    });
  }

  function fill(listId) {
    var b = document.getElementById(listId + '-stu');
    if (!b) return;
    var ids = Object.keys(lists[listId].ids).sort(function (a, c) {
      return String(names[a]).localeCompare(String(names[c]), 'pt', { sensitivity: 'base' });
    });
    var box = b.querySelector('.ea-stu-chips');
    var html = '<button type="button" class="ea-chip all" data-id="" aria-pressed="' + (!cur) + '">Todos</button>' +
      ids.map(function (id) {
        var n = names[id] || 'Aluno';
        return '<button type="button" class="ea-chip" data-id="' + esc(id) + '" data-name="' + esc(n) + '" title="' + esc(n) +
          '" aria-pressed="' + (id === cur) + '"><i>' + esc(initials(n)) + '</i><span>' + esc(shortName(n)) + '</span></button>';
      }).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
    var q = b.querySelector('.ea-stu-q');
    q.hidden = ids.length <= 8;
    search(b, q.hidden ? '' : q.value);
    var info = b.querySelector('.ea-stu-info');
    info.textContent = cur ? '· ' + lists[listId].count + (lists[listId].count === 1 ? ' item' : ' itens') : '';
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
    if (!lists[listId]) lists[listId] = { reload: reload, ids: {}, count: 0 };
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

    var out = cur ? only(items, cur) : items;
    lists[listId].count = out.length;
    fill(listId);
    if (cur && !out.length) {
      var list = document.getElementById(listId);
      if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔎</div><p>' +
        esc(shortName(names[cur] || 'Este aluno')) + ' ainda não tem nada nesta seção.</p></div>';
      return null;
    }
    return out;
  }

  window.EA_STU = { apply: apply, only: only };
})();
