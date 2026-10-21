// ═══ FILTRO POR ALUNO ═══
// Usado nos dashboards do professor e da coordenação (Homework, Feedback,
// Redação, Pronúncia, Vocabulário, Planos de Aula).
//
// EA_STU.apply(listId, items, reload)
//   Cria (uma vez) um <select> logo acima da lista, com os alunos presentes
//   nos itens, e devolve só os itens do aluno escolhido. Se o filtro não
//   encontrar nada, desenha o aviso na própria lista e devolve null.
// EA_STU.only(items, studentId)
//   Filtra sem criar select (usado pelo filtro compartilhado da Supervisão).
(function () {
  var css =
    '.ea-stu-bar{display:flex;align-items:center;gap:10px;padding:12px 20px 4px;flex-wrap:wrap}' +
    '.ea-stu-bar label{font-size:12.5px;font-weight:800;color:var(--navy);white-space:nowrap}' +
    '.ea-stu-bar select{flex:1;min-width:180px;max-width:360px;padding:9px 12px;border:1.5px solid var(--g200,#E5E7EB);border-radius:10px;background:#fff;font-family:inherit;font-size:13.5px;color:var(--navy);cursor:pointer;outline:none}' +
    '.ea-stu-bar select:focus{border-color:var(--orange,#D71920)}' +
    '.ea-stu-bar .ea-stu-clear{border:0;background:none;color:var(--orange,#D71920);font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;padding:4px 2px}' +
    '@media(max-width:600px){.ea-stu-bar{padding:10px 14px 2px}.ea-stu-bar select{max-width:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  // Alunos de um item: [{id, name}]
  function studentsOf(it) {
    if (!it) return [];
    if (Array.isArray(it.task_submissions)) {
      return it.task_submissions.map(function (s) {
        return { id: s.student_id, name: (s.student && s.student.full_name) || 'Aluno' };
      }).filter(function (s) { return s.id; });
    }
    if (it.student_id) return [{ id: it.student_id, name: (it.student && it.student.full_name) || 'Aluno' }];
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

  var state = {};   // listId -> aluno escolhido
  var reloads = {}; // listId -> função que recarrega a lista

  function bar(listId) {
    var id = listId + '-stu';
    var el = document.getElementById(id);
    if (el) return el;
    var list = document.getElementById(listId);
    if (!list || !list.parentNode) return null;
    el = document.createElement('div');
    el.id = id; el.className = 'ea-stu-bar';
    el.innerHTML = '<label for="' + id + '-sel">👤 Filtrar por aluno</label><select id="' + id + '-sel"></select>' +
      '<button type="button" class="ea-stu-clear" style="display:none">Limpar</button>';
    list.parentNode.insertBefore(el, list);
    var sel = el.querySelector('select'), clr = el.querySelector('.ea-stu-clear');
    sel.onchange = function () { state[listId] = sel.value; if (reloads[listId]) reloads[listId](); };
    clr.onclick = function () { sel.value = ''; sel.onchange(); };
    return el;
  }

  function apply(listId, items, reload) {
    items = items || [];
    reloads[listId] = reload;
    var b = bar(listId);
    if (!b) return items;

    var map = {};
    items.forEach(function (it) { studentsOf(it).forEach(function (s) { map[s.id] = s.name; }); });
    var ids = Object.keys(map).sort(function (a, b2) {
      return String(map[a]).localeCompare(String(map[b2]), 'pt', { sensitivity: 'base' });
    });
    var cur = state[listId] || '';
    if (cur && !map[cur]) cur = state[listId] = '';

    var sel = b.querySelector('select');
    sel.innerHTML = '<option value="">Todos os alunos (' + ids.length + ')</option>' +
      ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(map[id]) + '</option>'; }).join('');
    sel.value = cur;
    b.querySelector('.ea-stu-clear').style.display = cur ? '' : 'none';
    b.style.display = (ids.length > 1 || cur) ? '' : 'none';

    if (!cur) return items;
    var out = only(items, cur);
    if (!out.length) {
      var list = document.getElementById(listId);
      if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔎</div><p>Nada encontrado para ' + esc(map[cur]) + '.</p></div>';
      return null;
    }
    return out;
  }

  window.EA_STU = { apply: apply, only: only };
})();
