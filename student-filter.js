// ═══ FILTRO POR ALUNO ═══
// Usado nos dashboards do professor e da coordenação (Homework, Feedback,
// Redação, Pronúncia, Vocabulário) e na Supervisão da coordenação.
//
// EA_STU.apply(listId, items, reload)
//   Cria (uma vez) a barra de filtro dentro do painel da lista e devolve só os
//   itens do aluno escolhido. Se não houver nada, desenha o aviso na própria
//   lista (com botão para limpar) e devolve null.
// EA_STU.only(items, studentId)
//   Filtra sem criar barra (usado pelo filtro da Supervisão).
// EA_STU.enhanceSelect(selectEl, { label, allLabel, placeholder })
//   Troca um <select> comum pelo mesmo seletor com busca. O <select> continua
//   sendo a fonte do valor (fica escondido) e recebe o evento "change".
//
// O seletor abre uma lista com busca: digite, use ↑ ↓ e Enter; Esc fecha.
// No celular a lista abre como uma gaveta vinda de baixo.
// Por padrão, o aluno escolhido vale para todas as seções (fica visível numa
// faixa "Mostrando: …" em cada uma). Dá para desligar e filtrar por seção.
(function () {
  var css =
    '.ea-stu-bar{margin:6px 16px 2px;padding:12px 0 10px;border-bottom:1px solid #EEF1F4}' +
    '.ea-stu-top{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}' +
    '.ea-stu-slot{display:inline-flex;max-width:100%}' +
    '.ea-stu-scope{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:12.5px;color:#4A6075;font-weight:600;cursor:pointer;user-select:none}' +
    '.ea-stu-scope input{width:15px;height:15px;accent-color:#0B1F33;margin:0;cursor:pointer}' +
    '.ea-stu-active{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding:8px 10px 8px 12px;border-radius:10px;background:#F5F7FA;border-left:3px solid #D71920;font-size:13px;color:#0B1F33}' +
    '.ea-stu-active[hidden]{display:none}' +
    '.ea-stu-active b{font-weight:800}' +
    '.ea-stu-active .ea-stu-n{color:#4A6075;font-weight:600}' +
    '.ea-stu-clear{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid #D8DEDD;border-radius:999px;background:#fff;color:#0B1F33;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}' +
    '.ea-stu-clear:hover{border-color:#D71920;color:#D71920}' +
    '.ea-stu-clear:focus-visible,.ea-pk-btn:focus-visible{outline:2px solid #6F8FA8;outline-offset:2px}' +
    // botão do seletor
    '.ea-pk-btn{display:inline-flex;align-items:center;gap:8px;min-width:220px;max-width:100%;padding:6px 12px 6px 6px;border:1px solid #D8DEDD;border-radius:12px;background:#fff;color:#0B1F33;font:inherit;font-size:13.5px;cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s}' +
    '.ea-pk-btn:hover{border-color:#6F8FA8}' +
    '.ea-pk-btn[aria-expanded="true"]{border-color:#0B1F33;box-shadow:0 0 0 3px rgba(11,31,51,.08)}' +
    '.ea-pk-btn.on{border-color:#0B1F33}' +
    '.ea-pk-av{flex:none;width:26px;height:26px;border-radius:8px;background:#E8EEF3;color:#0B1F33;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
    '.ea-pk-btn.on .ea-pk-av{background:#D71920;color:#fff}' +
    '.ea-pk-lbl{color:#4A6075;font-weight:600;flex:none}' +
    '.ea-pk-val{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}' +
    '.ea-pk-car{flex:none;width:14px;height:14px;color:#6F8FA8;transition:transform .15s}' +
    '.ea-pk-btn[aria-expanded="true"] .ea-pk-car{transform:rotate(180deg)}' +
    // lista suspensa
    '.ea-pk-pop{position:fixed;z-index:10000;width:340px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #D8DEDD;border-radius:14px;box-shadow:0 14px 40px rgba(11,31,51,.18);display:flex;flex-direction:column;overflow:hidden}' +
    '.ea-pk-pop[hidden]{display:none}' +
    '.ea-pk-head{display:none;align-items:center;justify-content:space-between;padding:14px 16px 4px;font-weight:800;color:#0B1F33;font-size:15px}' +
    '.ea-pk-x{border:0;background:#F5F7FA;width:32px;height:32px;border-radius:50%;font-size:16px;color:#0B1F33;cursor:pointer}' +
    '.ea-pk-q{margin:10px;padding:9px 12px 9px 34px;border:1px solid #D8DEDD;border-radius:10px;font:inherit;font-size:14px;color:#0B1F33;outline:none;' +
      'background:#F5F7FA url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236F8FA8\' stroke-width=\'2.4\' stroke-linecap=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'7\'/%3E%3Cpath d=\'m20 20-3.5-3.5\'/%3E%3C/svg%3E") no-repeat 12px center}' +
    '.ea-pk-q:focus{border-color:#6F8FA8;background-color:#fff}' +
    '.ea-pk-list{list-style:none;margin:0;padding:0 6px 6px;max-height:320px;overflow-y:auto;overscroll-behavior:contain}' +
    '.ea-pk-opt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;color:#0B1F33}' +
    '.ea-pk-opt[hidden]{display:none}' +
    '.ea-pk-opt.act{background:#F0F3F7}' +
    '.ea-pk-opt[aria-selected="true"]{background:#0B1F33;color:#fff}' +
    '.ea-pk-opt[aria-selected="true"] .ea-pk-av{background:#D71920;color:#fff}' +
    '.ea-pk-opt[aria-selected="true"] .ea-pk-sub{color:#C9D3DD}' +
    '.ea-pk-txt{flex:1;min-width:0;display:flex;flex-direction:column}' +
    '.ea-pk-name{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ea-pk-sub{font-size:12px;color:#6F8FA8;font-weight:600}' +
    '.ea-pk-pend{flex:none;padding:2px 8px;border-radius:999px;background:#FDE8E9;color:#B4141B;font-size:11.5px;font-weight:800}' +
    '.ea-pk-opt[aria-selected="true"] .ea-pk-pend{background:#D71920;color:#fff}' +
    '.ea-pk-none{padding:18px 12px;text-align:center;color:#6F8FA8;font-size:13px}' +
    '.ea-pk-none[hidden]{display:none}' +
    '.ea-pk-back{position:fixed;inset:0;z-index:9999;background:rgba(11,31,51,.35)}' +
    '.ea-pk-back[hidden]{display:none}' +
    '@media(max-width:600px){' +
      '.ea-stu-bar{margin:4px 12px 0}.ea-stu-slot{display:flex;width:100%}.ea-pk-btn{min-width:0;width:100%}.ea-stu-scope{margin-left:0}' +
      '.ea-pk-pop.sheet{left:0!important;right:0;bottom:0;top:auto!important;width:auto;max-width:none;max-height:80vh;border-radius:18px 18px 0 0;padding-bottom:env(safe-area-inset-bottom)}' +
      '.ea-pk-pop.sheet .ea-pk-head{display:flex}' +
      '.ea-pk-pop.sheet .ea-pk-list{max-height:none;flex:1}' +
      '.ea-pk-opt{padding:11px 10px}' +
    '}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var CARET = '<svg class="ea-pk-car" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML.replace(/"/g, '&quot;'); }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function initials(n) {
    var p = String(n || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function isMobile() { return window.matchMedia && window.matchMedia('(max-width:600px)').matches; }
  function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} }

  // ─────────────────────────────────────────────────────────────
  // Seletor com busca (componente reaproveitado em todo lugar)
  //   o.getOptions() → [{ id, name, sub?, pend? }]   (sem a opção "todos")
  //   o.getValue()   → id escolhido ('' = todos)
  //   o.onChoose(id)
  // ─────────────────────────────────────────────────────────────
  var openPicker = null;
  var backdrop = null;

  function Picker(o) {
    var self = this;
    this.o = o;
    this.uid = 'eapk' + Math.random().toString(36).slice(2, 8);

    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ea-pk-btn';
    b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', this.uid);
    this.btn = b;

    var p = document.createElement('div');
    p.className = 'ea-pk-pop'; p.hidden = true; p.id = this.uid;
    p.innerHTML = '<div class="ea-pk-head"><span>' + esc(o.label || 'Aluno') + '</span><button type="button" class="ea-pk-x" aria-label="Fechar">✕</button></div>' +
      '<input type="search" class="ea-pk-q" placeholder="' + esc(o.placeholder || 'Buscar aluno pelo nome') + '" aria-label="' + esc(o.placeholder || 'Buscar aluno pelo nome') + '" autocomplete="off">' +
      '<ul class="ea-pk-list" role="listbox" aria-label="' + esc(o.label || 'Aluno') + '"></ul>' +
      '<div class="ea-pk-none" hidden>Nenhum aluno com esse nome.</div>';
    document.body.appendChild(p);
    this.pop = p; this.q = p.querySelector('.ea-pk-q'); this.ul = p.querySelector('.ea-pk-list');

    b.addEventListener('click', function () { self.isOpen() ? self.close(true) : self.open(); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); self.open(); }
    });
    p.querySelector('.ea-pk-x').addEventListener('click', function () { self.close(true); });
    this.q.addEventListener('input', function () { self.filter(); });
    this.q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); self.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); self.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); var a = self.ul.querySelector('.ea-pk-opt.act'); if (a) self.pick(a.getAttribute('data-id')); }
      else if (e.key === 'Escape') { e.preventDefault(); self.close(true); }
      else if (e.key === 'Tab') { self.close(false); }
    });
    this.ul.addEventListener('mousedown', function (e) { e.preventDefault(); }); // não tira o foco da busca
    this.ul.addEventListener('click', function (e) {
      var li = e.target.closest('.ea-pk-opt'); if (li) self.pick(li.getAttribute('data-id'));
    });
    this.ul.addEventListener('mousemove', function (e) {
      var li = e.target.closest('.ea-pk-opt'); if (li && !li.classList.contains('act')) self.setAct(li);
    });
    this.render();
  }

  Picker.prototype.isOpen = function () { return !this.pop.hidden; };

  Picker.prototype.render = function () {
    var o = this.o, v = o.getValue() || '', opts = o.getOptions() || [], cur = null;
    for (var i = 0; i < opts.length; i++) if (opts[i].id === v) { cur = opts[i]; break; }
    this.btn.classList.toggle('on', !!v);
    this.btn.innerHTML = '<span class="ea-pk-av">' + (v ? esc(initials(cur ? cur.name : '')) : '👥') + '</span>' +
      '<span class="ea-pk-lbl">' + esc(o.label || 'Aluno') + ':</span>' +
      '<span class="ea-pk-val">' + esc(v ? (cur ? cur.name : 'Aluno') : (o.allLabel || 'Todos os alunos')) + '</span>' + CARET;
    this.btn.title = v && cur ? cur.name : '';
    if (this.isOpen()) this.fillList();
  };

  Picker.prototype.fillList = function () {
    var o = this.o, v = o.getValue() || '', opts = o.getOptions() || [];
    var all = { id: '', name: o.allLabel || 'Todos os alunos', sub: o.allSub || '', all: true }, uid = this.uid;
    this.ul.innerHTML = [all].concat(opts).map(function (it, i) {
      return '<li class="ea-pk-opt" role="option" id="' + uid + '-o' + i + '" data-id="' + esc(it.id) + '" data-name="' + esc(it.all ? '' : it.name) +
        '" aria-selected="' + (it.id === v) + '"><span class="ea-pk-av">' + (it.all ? '👥' : esc(initials(it.name))) + '</span>' +
        '<span class="ea-pk-txt"><span class="ea-pk-name">' + esc(it.name) + '</span>' +
        (it.sub ? '<span class="ea-pk-sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
        (it.pend ? '<span class="ea-pk-pend" title="Para corrigir">' + it.pend + '</span>' : '') + '</li>';
    }).join('');
    this.filter();
  };

  Picker.prototype.filter = function () {
    var q = norm(this.q.value), any = false, first = null, sel = null;
    this.ul.querySelectorAll('.ea-pk-opt').forEach(function (li) {
      var id = li.getAttribute('data-id');
      var hide = !!q && (id === '' || norm(li.getAttribute('data-name')).indexOf(q) < 0);
      li.hidden = hide;
      if (!hide) { any = true; if (!first) first = li; if (li.getAttribute('aria-selected') === 'true') sel = li; }
    });
    this.pop.querySelector('.ea-pk-none').hidden = any;
    this.setAct(q ? first : (sel || first));
  };

  Picker.prototype.setAct = function (li) {
    this.ul.querySelectorAll('.ea-pk-opt.act').forEach(function (x) { x.classList.remove('act'); });
    if (!li) { this.q.removeAttribute('aria-activedescendant'); return; }
    li.classList.add('act');
    this.q.setAttribute('aria-activedescendant', li.id);
    var top = li.offsetTop, bot = top + li.offsetHeight, ul = this.ul;
    if (top < ul.scrollTop) ul.scrollTop = top - 6;
    else if (bot > ul.scrollTop + ul.clientHeight) ul.scrollTop = bot - ul.clientHeight + 6;
  };

  Picker.prototype.move = function (d) {
    var vis = Array.prototype.filter.call(this.ul.querySelectorAll('.ea-pk-opt'), function (li) { return !li.hidden; });
    if (!vis.length) return;
    var i = vis.indexOf(this.ul.querySelector('.ea-pk-opt.act'));
    i = i < 0 ? 0 : Math.max(0, Math.min(vis.length - 1, i + d));
    this.setAct(vis[i]);
  };

  Picker.prototype.place = function () {
    var p = this.pop;
    if (isMobile()) { p.classList.add('sheet'); p.style.top = ''; p.style.left = ''; return; }
    p.classList.remove('sheet');
    var r = this.btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24);
    var left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    var below = window.innerHeight - r.bottom, h = Math.min(p.offsetHeight || 400, 420);
    var top = (below < h + 12 && r.top > below) ? Math.max(12, r.top - h - 6) : r.bottom + 6;
    p.style.left = left + 'px'; p.style.top = top + 'px';
  };

  Picker.prototype.open = function () {
    if (openPicker && openPicker !== this) openPicker.close(false);
    openPicker = this;
    this.q.value = '';
    this.fillList();
    this.pop.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.q.setAttribute('role', 'combobox');
    this.q.setAttribute('aria-expanded', 'true');
    this.q.setAttribute('aria-controls', this.uid);
    this.place();
    if (isMobile()) {
      if (!backdrop) {
        backdrop = document.createElement('div'); backdrop.className = 'ea-pk-back'; backdrop.hidden = true;
        backdrop.addEventListener('click', function () { if (openPicker) openPicker.close(true); });
        document.body.appendChild(backdrop);
      }
      backdrop.hidden = false;
    }
    try { this.q.focus({ preventScroll: true }); } catch (e) { this.q.focus(); }
  };

  Picker.prototype.close = function (focusBtn) {
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.hidden = true;
    if (openPicker === this) openPicker = null;
    if (focusBtn) this.btn.focus();
  };

  Picker.prototype.pick = function (id) {
    this.close(true);
    this.o.onChoose(id || '');
    this.render();
  };

  document.addEventListener('mousedown', function (e) {
    if (!openPicker) return;
    if (openPicker.pop.contains(e.target) || openPicker.btn.contains(e.target)) return;
    openPicker.close(false);
  });
  window.addEventListener('resize', function () { if (openPicker) openPicker.place(); });
  window.addEventListener('scroll', function (e) {
    if (openPicker && !isMobile() && !openPicker.pop.contains(e.target)) openPicker.place();
  }, true);

  // ─────────────────────────────────────────────────────────────
  // Filtro das listas (Homework, Feedback, Redação, Pronúncia, Vocabulário)
  // ─────────────────────────────────────────────────────────────
  var KEY = 'win-stu-filter';            // aluno escolhido (modo "todas as seções")
  var MODE_KEY = 'win-stu-mode';         // 'all' (padrão) ou 'section'
  var mode = 'all';
  try { mode = localStorage.getItem(MODE_KEY) === 'section' ? 'section' : 'all'; } catch (e) {}
  var cur = ssGet(KEY);
  var names = {};   // id -> nome (todos os alunos já vistos)
  var lists = {};   // listId -> { reload, ids:{}, count, counts:{}, pend:{}, cur, picker }

  function curFor(listId) { return mode === 'all' ? cur : ((lists[listId] && lists[listId].cur) || ''); }

  // Alunos de um item: [{id, name, pend}]
  function studentsOf(it) {
    if (!it) return [];
    if (Array.isArray(it.task_submissions)) {
      return it.task_submissions.map(function (s) {
        return { id: s.student_id, name: (s.student && s.student.full_name) || '', pend: s.status === 'submitted' };
      }).filter(function (s) { return s.id; });
    }
    if (it.student_id) return [{ id: it.student_id, name: (it.student && it.student.full_name) || '', pend: it.status === 'submitted' }];
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

  // Alunos do seletor de envio da própria seção (inclui quem ainda não tem itens)
  function readSendSelect(listId) {
    var list = document.getElementById(listId);
    if (!list) return;
    var sc = scopeOf(list), sel = sc && sc.querySelector('.form-card select');
    if (!sel) return;
    var l = lists[listId], roster = {}, n = 0;
    l.hasRoster = true;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (!o.value) return;
      names[o.value] = o.textContent.replace(/\s*\([^)]*\)\s*$/, '').trim() || names[o.value] || 'Aluno';
      roster[o.value] = 1; n++;
    });
    var changed = Object.keys(roster).sort().join() !== Object.keys(l.roster || {}).sort().join();
    l.roster = roster; l.rosterReady = n > 0;
    return changed;
  }

  // Alunos que podem aparecer: com seletor de envio na seção, só os da turma
  // ativa (matrícula ativa). Assim quem está no arquivo morto não aparece.
  function allowed(l, sid) { return !l.hasRoster || !!(l.roster && l.roster[sid]); }
  function keepAllowed(l, items) {
    if (!l.hasRoster || !l.rosterReady) return items;
    var out = [];
    items.forEach(function (it) {
      if (Array.isArray(it.task_submissions)) {
        var subs = it.task_submissions.filter(function (s) { return allowed(l, s.student_id); });
        if (subs.length) out.push(subs.length === it.task_submissions.length ? it : Object.assign({}, it, { task_submissions: subs }));
      } else if (!it.student_id || allowed(l, it.student_id)) out.push(it);
    });
    return out;
  }

  function optionsFor(listId) {
    var l = lists[listId];
    return Object.keys(l.ids).filter(function (id) { return allowed(l, id); }).sort(function (a, c) {
      return String(names[a]).localeCompare(String(names[c]), 'pt', { sensitivity: 'base' });
    }).map(function (id) {
      var n = l.counts[id] || 0, p = l.pend[id] || 0;
      return { id: id, name: names[id] || 'Aluno', pend: p,
        sub: n ? plural(n, 'item', 'itens') + (p ? ' · ' + plural(p, 'para corrigir', 'para corrigir') : '') : 'Nada nesta seção ainda' };
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
    el.innerHTML = '<div class="ea-stu-top"><span class="ea-stu-slot"></span>' +
      '<label class="ea-stu-scope" title="Ao escolher um aluno aqui, as outras seções também mostram só ele.">' +
      '<input type="checkbox"> Manter o aluno em todas as seções</label></div>' +
      '<div class="ea-stu-active" role="status" hidden></div>';
    // Dentro do painel da lista (logo abaixo do título), longe do formulário de envio
    var sc = scopeOf(list);
    var panel = list.closest('.panel'), head = panel && panel.querySelector('.panel-head');
    if (head && head.parentNode === panel) panel.insertBefore(el, head.nextSibling);
    else list.parentNode.insertBefore(el, list);

    var pk = new Picker({
      label: 'Aluno', allLabel: 'Todos os alunos',
      getOptions: function () { return optionsFor(listId); },
      getValue: function () { return curFor(listId); },
      onChoose: function (sid) { choose(listId, sid); }
    });
    el.querySelector('.ea-stu-slot').appendChild(pk.btn);
    lists[listId].picker = pk;

    var chk = el.querySelector('.ea-stu-scope input');
    chk.checked = mode === 'all';
    chk.addEventListener('change', function () { setMode(this.checked ? 'all' : 'section', listId); });

    el.querySelector('.ea-stu-active').addEventListener('click', function (e) {
      if (e.target.closest('.ea-stu-clear')) choose(listId, '');
    });
    // Quando o seletor de envio da seção termina de carregar, atualiza os alunos
    var send = sc && sc.querySelector('.form-card select');
    if (send && window.MutationObserver) {
      new MutationObserver(function () { if (readSendSelect(listId)) reloadList(listId); else fill(listId); })
        .observe(send, { childList: true });
    }
    return el;
  }

  function fill(listId) {
    var b = document.getElementById(listId + '-stu'), l = lists[listId];
    if (!b || !l) return;
    if (l.picker) l.picker.render();
    var chk = b.querySelector('.ea-stu-scope input');
    if (chk) chk.checked = mode === 'all';
    var sid = curFor(listId), act = b.querySelector('.ea-stu-active');
    act.hidden = !sid;
    if (sid) {
      act.innerHTML = 'Mostrando: <b>' + esc(names[sid] || 'Aluno') + '</b>' +
        '<span class="ea-stu-n">· ' + plural(l.count, 'item', 'itens') + (mode === 'all' ? ' · filtro vale para todas as seções' : '') + '</span>' +
        '<button type="button" class="ea-stu-clear" aria-label="Limpar filtro e mostrar todos os alunos">✕ Limpar filtro</button>';
    }
  }

  function reloadList(lid) {
    var l = lists[lid];
    if (l && typeof l.reload === 'function') { try { l.reload(); } catch (e) {} }
  }

  function choose(listId, sid) {
    sid = sid || '';
    if (mode === 'all') {
      cur = sid; ssSet(KEY, cur);
      Object.keys(lists).forEach(function (lid) {
        var l = lists[lid];
        if (cur && !l.ids[cur] && names[cur] && allowed(l, cur)) l.ids[cur] = 1;
        reloadList(lid);
      });
    } else {
      lists[listId].cur = sid; ssSet(KEY + ':' + listId, sid);
      reloadList(listId);
    }
  }

  // Liga/desliga "Manter o aluno em todas as seções".
  // Quem estava escolhido na seção atual continua escolhido.
  function setMode(m, fromList) {
    if (m === mode) return;
    var keep = curFor(fromList);
    mode = m;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    if (mode === 'all') {
      cur = keep; ssSet(KEY, cur);
      Object.keys(lists).forEach(function (lid) { lists[lid].cur = ''; ssSet(KEY + ':' + lid, ''); });
    } else {
      cur = ''; ssSet(KEY, '');
      Object.keys(lists).forEach(function (lid) {
        lists[lid].cur = lid === fromList ? keep : '';
        ssSet(KEY + ':' + lid, lists[lid].cur);
      });
    }
    Object.keys(lists).forEach(reloadList);
  }

  function apply(listId, items, reload) {
    items = items || [];
    if (!lists[listId]) lists[listId] = { reload: reload, ids: {}, count: 0, counts: {}, pend: {}, cur: ssGet(KEY + ':' + listId), roster: {} };
    var l = lists[listId];
    l.reload = reload;
    var b = bar(listId);
    if (!b) return items;
    readSendSelect(listId);
    items = keepAllowed(l, items);

    l.counts = {}; l.pend = {};
    items.forEach(function (it) {
      studentsOf(it).forEach(function (s) {
        if (s.name || !names[s.id]) names[s.id] = s.name || names[s.id] || 'Aluno';
        l.ids[s.id] = 1;
        l.counts[s.id] = (l.counts[s.id] || 0) + 1;
        if (s.pend) l.pend[s.id] = (l.pend[s.id] || 0) + 1;
      });
    });
    Object.keys(l.roster || {}).forEach(function (id) { l.ids[id] = 1; });
    var sid = curFor(listId);
    if (sid && l.rosterReady && !allowed(l, sid)) {
      // O aluno escolhido não está mais na turma ativa (ex.: arquivado): limpa.
      if (mode === 'all') { cur = ''; ssSet(KEY, ''); } else { l.cur = ''; ssSet(KEY + ':' + listId, ''); }
      sid = '';
    }
    if (sid && names[sid]) l.ids[sid] = 1;

    var out = sid ? only(items, sid) : items;
    l.count = out.length;
    fill(listId);
    if (sid && !out.length) {
      var list = document.getElementById(listId);
      if (list) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔎</div><p>' +
          esc(names[sid] || 'Este aluno') + ' ainda não tem nada nesta seção.</p>' +
          '<p><button type="button" class="ea-stu-clear" style="margin:6px auto 0">✕ Limpar filtro</button></p></div>';
        var btn = list.querySelector('.ea-stu-clear');
        if (btn) btn.addEventListener('click', function () { choose(listId, ''); });
      }
      return null;
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // <select> comum → seletor com busca (Supervisão da coordenação)
  // ─────────────────────────────────────────────────────────────
  function enhanceSelect(sel, o) {
    if (!sel || sel._eaPicker) return sel && sel._eaPicker;
    o = o || {};
    var pk = new Picker({
      label: o.label || 'Aluno',
      allLabel: o.allLabel || (sel.options[0] && !sel.options[0].value ? sel.options[0].textContent : 'Todos'),
      placeholder: o.placeholder,
      getOptions: function () {
        return Array.prototype.filter.call(sel.options, function (op) { return op.value; }).map(function (op) {
          return { id: op.value, name: op.textContent, sub: op.getAttribute('data-sub') || '' };
        });
      },
      getValue: function () { return sel.value; },
      onChoose: function (id) {
        if (sel.value === id) return;
        sel.value = id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    sel.style.display = 'none';
    sel.setAttribute('aria-hidden', 'true');
    sel.tabIndex = -1;
    sel.parentNode.insertBefore(pk.btn, sel);
    if (o.grow) pk.btn.style.flex = '1';
    if (window.MutationObserver) new MutationObserver(function () { pk.render(); }).observe(sel, { childList: true });
    sel.addEventListener('change', function () { pk.render(); });
    sel._eaPicker = pk;
    return pk;
  }

  window.EA_STU = { apply: apply, only: only, enhanceSelect: enhanceSelect };
})();
