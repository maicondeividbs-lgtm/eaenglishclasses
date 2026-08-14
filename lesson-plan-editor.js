// ═══════════════════════════════════════════════════════════════
// EDITOR DE PLANOS DE AULA — módulo compartilhado (professor + coordenação).
// Fonte única do editor "agenda em cartões" — a MESMA estrutura nos dois painéis.
// Depende de: supabase.js (getMyStudents, getScheduleSlots, getScheduleEvents,
// getLessonPlan, saveLessonPlan, lpMonthKey, eaPrintLessonPlan, showToast),
// curriculum-index.js (window.EA_CURRICULUM_INDEX) e das funções globais
// checkFeriado / fmtDateISO já presentes em cada dashboard. O markup do editor
// (mesmos ids) fica em cada painel; aqui mora toda a lógica.
// ═══════════════════════════════════════════════════════════════
var _lpState = { studentId:null, studentName:'', monthKey:null, dirty:false,
                 hw:[], history:[], speaking:[], speakOk:true, progress:null };
var LP_WD = ['dom','seg','ter','qua','qui','sex','sáb'];   // JS getDay()
var LP_MO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
var LP_MONTHS_FULL = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function loadLessonPlansSection() {
  // popula o select de alunos do editor (mesma fonte nos dois painéis)
  var sel = document.getElementById('lpStudent');
  if (sel && !sel.dataset.lpLoaded) {
    var students = window._myStudents;
    if (!students || !students.length) {
      try { students = await getMyStudents(currentUser.id); window._myStudents = students; }
      catch(e){ students = []; }
    }
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    sel.innerHTML = '<option value="">Selecione um aluno</option>' +
      (students||[]).map(function(s){ return '<option value="'+s.id+'">'+esc(s.full_name||'')+'</option>'; }).join('');
    sel.dataset.lpLoaded = '1';
  }
  var m = document.getElementById('lpMonth');
  if (m && !m.value) { var now = new Date(); m.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'); }
  lpUpdateMonthLabel();
}

function lpFindStudent(id) {
  var list = window._myStudents || [];
  for (var i=0;i<list.length;i++) if (String(list[i].id)===String(id)) return list[i];
  return null;
}

// Capa do livro do aluno (assets reais em img/books/*.webp)
function lpBookCover(name){
  var s = (name||'').toLowerCase();
  var file = null;
  if (s.indexOf('evolve')>=0){
    if (s.indexOf('6')>=0) file='evolve-6';
    else if (s.indexOf('5')>=0) file='evolve-5';
  } else if (s.indexOf('interchange')>=0 || s.indexOf('intro')>=0){
    if (s.indexOf('intro')>=0) file='interchange-intro';
    else if (s.indexOf('3')>=0) file='interchange-3';
    else if (s.indexOf('2')>=0) file='interchange-2';
    else if (s.indexOf('1')>=0) file='interchange-1';
  }
  return file ? ('img/books/'+file+'.webp') : null;
}
function lpUpdateBookCover(){
  var wrap = document.getElementById('lpBookCover');
  var img  = document.getElementById('lpBookCoverImg');
  if (!wrap || !img) return;
  var url = lpBookCover(document.getElementById('lpHdrBook').value);
  if (url){ img.src = url; img.alt = 'Capa: ' + document.getElementById('lpHdrBook').value; wrap.hidden = false; }
  else { wrap.hidden = true; img.removeAttribute('src'); }
}
function lpBookCoverErr(){
  var wrap = document.getElementById('lpBookCover');
  if (wrap) wrap.hidden = true;
}

function lpFmtMonthLabel(v) {            // 'YYYY-MM' -> 'Julho 2025'
  if (!v) return '—';
  var p = v.split('-');
  return (LP_MONTHS_FULL[parseInt(p[1],10)]||'') + ' ' + p[0];
}
function lpMonthLabelFromValue(v) {      // usado no PDF: 'Julho de 2025'
  if (!v) return '';
  var p = v.split('-');
  return (LP_MONTHS_FULL[parseInt(p[1],10)]||'') + ' de ' + p[0];
}
function lpUpdateMonthLabel() {
  var v = document.getElementById('lpMonth').value;
  var lbl = document.getElementById('lpMonthLabelTop');
  if (lbl) lbl.textContent = lpFmtMonthLabel(v);
  var ml = document.getElementById('lpMonthLabel');
  if (ml) ml.textContent = '— ' + lpMonthLabelFromValue(v);
}

function lpMonthStep(delta) {
  var el = document.getElementById('lpMonth');
  var v = el.value || (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })();
  var p = v.split('-'); var y=parseInt(p[0],10), m=parseInt(p[1],10)-1;
  var d = new Date(y, m+delta, 1);
  el.value = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  lpUpdateMonthLabel();
  lpOnPick();
}
function lpOpenMonthPicker() {
  var el = document.getElementById('lpMonth');
  if (el && el.showPicker) { try { el.showPicker(); return; } catch(e){} }
  if (el) el.focus();
}

async function lpOnPick() {
  var sid = document.getElementById('lpStudent').value;
  var mv  = document.getElementById('lpMonth').value;
  var editor = document.getElementById('lpEditor');
  var hint = document.getElementById('lpPickHint');
  lpUpdateMonthLabel();
  if (!sid || !mv) {
    editor.style.display = 'none';
    hint.style.display = '';
    hint.textContent = 'Selecione o aluno e o mês para abrir o plano.';
    return;
  }
  if (_lpState.dirty) {
    if (!confirm('Há alterações não salvas neste plano. Trocar de aluno/mês vai descartá-las. Continuar?')) {
      if (_lpState.studentId) document.getElementById('lpStudent').value = _lpState.studentId;
      if (_lpState.monthKey) { var pp=_lpState.monthKey.split('-'); document.getElementById('lpMonth').value = pp[0]+'-'+pp[1]; lpUpdateMonthLabel(); }
      return;
    }
  }
  var student = lpFindStudent(sid);
  var mp = mv.split('-');
  var monthKey = (typeof lpMonthKey==='function') ? lpMonthKey(parseInt(mp[0],10), parseInt(mp[1],10)) : (mv + '-01');
  _lpState = { studentId:sid, studentName:(student&&student.full_name)||'', monthKey:monthKey, dirty:false };
  hint.style.display = 'none';
  editor.style.display = '';

  document.getElementById('lpHdrStudent').textContent = _lpState.studentName || '—';
  var av = document.getElementById('lpAvatar');
  if (av) av.textContent = (_lpState.studentName||'•').trim().charAt(0).toUpperCase() || '•';

  var autoBook  = (student && student.course_name) || '';
  var autoLevel = (student && (student.cefr || student.level)) || '';

  // Carrega em paralelo: plano do mes + homework realmente enviado +
  // historico de planos (completude) + observacoes de speaking.
  var loaded = await Promise.all([
    getLessonPlan(currentUser.id, sid, monthKey).catch(function(e){ console.error('getLessonPlan', e); return null; }),
    lpLoadHomeworkSent(sid),
    lpLoadHistory(sid),
    lpLoadSpeaking(sid)
  ]);
  var saved = loaded[0];

  if (saved) {
    document.getElementById('lpHdrBook').value  = saved.book  != null ? saved.book  : autoBook;
    document.getElementById('lpHdrLevel').value = saved.level != null ? saved.level : autoLevel;
    lpSetTotalPages(saved.book_pages);
    lpRenderRows(saved.entries || []);
  } else {
    document.getElementById('lpHdrBook').value  = autoBook;
    document.getElementById('lpHdrLevel').value = autoLevel;
    lpSetTotalPages(null);
    var gen = await lpGenerateRowsFromSchedule(_lpState.studentName, mv);
    lpRenderRows(gen);
  }
  lpUpdateBookCover();
  lpBindHeaderInputs();
  lpRenderSpeakPanel();
  lpUpdateProgress();
  lpSetDirty(false);
}

function lpBindHeaderInputs(){
  ['lpHdrBook','lpHdrLevel','lpHdrPages'].forEach(function(id){
    var el=document.getElementById(id);
    if (el && !el._lpBound){
      el._lpBound=true;
      el.addEventListener('input', function(){ lpSetDirty(true); if (id==='lpHdrPages') lpUpdateProgress(); });
    }
  });
  var sd = document.getElementById('lpSpDate');
  if (sd && !sd._lpBound){ sd._lpBound=true; sd.addEventListener('change', function(){ lpSpSyncEditor(); }); }
}

async function lpGenerateRowsFromSchedule(studentName, monthValue) {
  var rows = [];
  if (!studentName || !monthValue) return rows;
  var mp = monthValue.split('-');
  var year = parseInt(mp[0],10), month = parseInt(mp[1],10);
  var target = studentName.trim().toLowerCase();
  var slots = [];
  try { slots = await getScheduleSlots(currentUser.id); } catch(e){ slots = []; }
  var mine = slots.filter(function(s){ return (s.student_name||'').trim().toLowerCase() === target; });
  if (!mine.length) return rows;
  var cancelledDates = {};
  try {
    var evts = await getScheduleEvents(currentUser.id, month, year);
    for (var i=0;i<evts.length;i++){
      var ev = evts[i];
      var isCancel = (ev.event_type||'').indexOf('cancellation') === 0;
      var sameStudent = !ev.student_name || (ev.student_name||'').trim().toLowerCase() === target;
      if (isCancel && sameStudent && ev.event_date) cancelledDates[String(ev.event_date).substring(0,10)] = true;
    }
  } catch(e){}
  var daysInMonth = new Date(year, month, 0).getDate();
  for (var d=1; d<=daysInMonth; d++){
    var dateObj = new Date(year, month-1, d);
    var jsDow = dateObj.getDay();
    for (var si=0; si<mine.length; si++){
      var slot = mine[si];
      if ((slot.day_of_week + 1) !== jsDow) continue;
      var iso = fmtDateISO(dateObj);
      if (cancelledDates[iso]) continue;
      var fer = (typeof checkFeriado === 'function') ? checkFeriado(iso) : null;
      if (fer && (fer.tipo==='nacional' || fer.tipo==='estadual' || fer.tipo==='municipal')) continue;
      rows.push({ lesson_date: iso, _gen:true, _time:(slot.time_slot||'') });
    }
  }
  rows.sort(function(a,b){
    if (a.lesson_date !== b.lesson_date) return a.lesson_date < b.lesson_date ? -1 : 1;
    return (a._time||'') < (b._time||'') ? -1 : 1;
  });
  return rows;
}

// selo de data (dia grande + "qui · jul"); vazio => convite a definir
function lpDateChipHTML(iso){
  if (!iso) return '<span class="d">＋</span><span class="m">data</span>';
  var p = String(iso).substring(0,10).split('-');
  var dt = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
  return '<span class="d">'+p[2]+'</span><span class="m">'+LP_WD[dt.getDay()]+' · '+LP_MO[parseInt(p[1],10)-1]+'</span>';
}

function lpRenderRows(rows) {
  var box = document.getElementById('lpRows');
  box.innerHTML = '';
  if (!rows || !rows.length) { lpAppendRow({}); lpUpdateCount(); return; }
  for (var i=0;i<rows.length;i++) lpAppendRow(rows[i]);
  lpChainLast();
  lpUpdateCount();
}

function lpAppendRow(r) {
  r = r || {};
  var iso = r.lesson_date ? String(r.lesson_date).substring(0,10) : '';
  var card = document.createElement('div');
  card.className = 'lp2-card' + (r._gen ? ' gen' : '');
  card.innerHTML =
    '<button type="button" class="lp2-spbtn" title="Observa\u00e7\u00f5es de speaking desta aula" onclick="lpSpFromCard(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg></button>' +
    '<button type="button" class="lp2-del" title="Remover aula" onclick="lpRemoveRow(this)">✕</button>' +
    '<div class="lp2-datewrap" onclick="lpDateClick(this)">' +
      '<div class="lp2-date">'+lpDateChipHTML(iso)+'</div>' +
      '<input type="date" class="lp2-in-date" value="'+iso+'" aria-label="Data da aula">' +
    '</div>' +
    '<div class="lp2-body">' +
      '<input class="lp2-topic lp2-in-topic" placeholder="Tópico da aula">' +
      '<div class="lp2-obj">' +
        '<label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>Objetivo</label>' +
        '<input class="lp2-in-obj" placeholder="O que o aluno vai aprender / conseguir fazer">' +
      '</div>' +
      '<div class="lp2-fields">' +
        '<div class="lp2-f"><label title="Estimativa — pode mudar durante a aula"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>Páginas <em>(previsão)</em></label><input class="lp2-in-pages" placeholder="Estimativa — ex: 47, 48"></div>' +
        '<div class="lp2-f"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Homework</label><input class="lp2-in-hw" placeholder="O que passar de tarefa"></div>' +
        '<div class="lp2-f"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>Last homework</label><input class="lp2-in-last" placeholder="—"><span class="lp2-src" hidden></span></div>' +
      '</div>' +
      '<div class="lp2-lib" hidden></div>' +
      '<div class="lp2-spnote" hidden></div>' +
      '<div class="lp2-notes">' +
        '<label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/></svg>Observações</label>' +
        '<textarea rows="1" class="lp2-ta lp2-in-notes" placeholder="Anotações sobre esta aula (opcional)"></textarea>' +
      '</div>' +
    '</div>';
  document.getElementById('lpRows').appendChild(card);
  card.querySelector('.lp2-in-topic').value = r.topic || '';
  card.querySelector('.lp2-in-obj').value   = r.objective || '';
  card.querySelector('.lp2-in-pages').value = r.pages || '';
  card.querySelector('.lp2-in-hw').value    = r.homework || '';
  var lastEl = card.querySelector('.lp2-in-last');
  lastEl.value = r.last_homework || '';
  // last_auto (coluna v2) manda: true = recalcula do homework real; false = manual.
  // Sem a coluna (banco antigo), mantém o comportamento anterior.
  var isAuto;
  if (r.last_auto === true)       isAuto = true;
  else if (r.last_auto === false) isAuto = false;
  else                            isAuto = !r.last_homework;
  lastEl.dataset.auto = isAuto ? '1' : '';
  card.querySelector('.lp2-in-notes').value = r.notes || '';
  var ta = card.querySelector('.lp2-ta'); lpAutoGrow(ta); ta.addEventListener('input', function(){ lpAutoGrow(ta); });
  card.querySelectorAll('input,textarea').forEach(function(el){
    el.addEventListener('input', function(){ lpSetDirty(true); });
    el.addEventListener('change', function(){ lpSetDirty(true); });
  });
  // encadeamento do "last homework": ao editar o homework, atualiza o last da próxima aula;
  // ao digitar no last, ele vira manual (não é mais sobrescrito).
  card.querySelector('.lp2-in-hw').addEventListener('input', function(){ lpChainLast(); });
  lastEl.addEventListener('input', function(){ this.dataset.auto=''; this.classList.remove('lp2-auto'); });
  card.querySelector('.lp2-in-pages').addEventListener('input', function(){ lpRenderLib(card); lpUpdateProgress(); });
  lpRenderLib(card);
  lpRenderSpeakCard(card);
}

function lpAutoGrow(ta){ if(!ta) return; ta.style.height='auto'; ta.style.height=(ta.scrollHeight)+'px'; }

function lpDateClick(wrap){
  var i = wrap.querySelector('.lp2-in-date');
  if (i && i.showPicker){ try{ i.showPicker(); return; }catch(e){} }
  if (i) i.focus();
}

// "Last homework" automático, em ordem de prioridade:
//   1. manual  → o professor digitou; nunca sobrescrito (badge "manual ↺")
//   2. real    → último homework REALMENTE enviado antes do dia da aula
//   3. plano   → herda o Homework planejado na aula anterior (comportamento antigo)
function lpChainLast(){
  var cards = document.querySelectorAll('#lpRows .lp2-card');
  var prevHw = '';
  cards.forEach(function(card, i){
    var last = card.querySelector('.lp2-in-last');
    var hw   = card.querySelector('.lp2-in-hw');
    var manual = (last.dataset.auto !== '1') && (last.value||'').trim() !== '';
    if (manual){
      last.classList.remove('lp2-auto');
      last.dataset.auto = '';
      lpSrcBadge(last, 'manual');
    } else {
      var real = lpHwBefore(card.querySelector('.lp2-in-date').value);
      if (real && real.title){
        last.value = real.title;
        last.classList.add('lp2-auto');
        lpSrcBadge(last, 'real', lpFmtShort(real.sent_at));
      } else {
        var val = (i > 0) ? prevHw : '';
        last.value = val;
        last.classList.toggle('lp2-auto', !!val);
        lpSrcBadge(last, val ? 'plan' : '');
      }
      last.dataset.auto = '1';
    }
    prevHw = (hw.value||'').trim();
  });
}

// Sugestão de Objetivo/Homework via IA (Gemini, função server-side).
// ── Conexão com a BIBLIOTECA: casa "Páginas (previsão)" com os exemplos ──
// window.EA_CURRICULUM_INDEX vem de curriculum-index.js (derivado da biblioteca).
function lpLibLevel(book){
  var s = (book||'').toLowerCase();
  if (s.indexOf('evolve') >= 0){ if (s.indexOf('6')>=0) return 'evolve6'; if (s.indexOf('5')>=0) return 'evolve5'; return null; }
  if (s.indexOf('intro') >= 0) return 'intro';
  if (s.indexOf('interchange') >= 0 || /(^|\D)[123](\D|$)/.test(s)){
    if (s.indexOf('3')>=0) return 'lvl3'; if (s.indexOf('2')>=0) return 'lvl2'; if (s.indexOf('1')>=0) return 'lvl1';
  }
  return null;
}
function lpParsePages(text){
  var set = {}; text = String(text||''); var m;
  var rg = /(\d+)\s*[-–]\s*(\d+)/g;             // ranges pequenos (47-50)
  while ((m = rg.exec(text))){ var a=+m[1], b=+m[2]; if (b>=a && b-a<=40){ for (var p=a;p<=b;p++) set[p]=1; } }
  var n = /\d+/g;                                // números soltos
  while ((m = n.exec(text))){ set[+m[0]] = 1; }
  return set;
}
function lpLibMatchesForCard(card){
  var idx = window.EA_CURRICULUM_INDEX; if (!idx) return [];
  var level = lpLibLevel(document.getElementById('lpHdrBook').value);
  if (!level || !idx[level]) return [];
  var pages = lpParsePages(card.querySelector('.lp2-in-pages').value);
  if (!Object.keys(pages).length) return [];
  return idx[level].filter(function(t){ return pages[t.page]; });
}
function lpLibEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function lpRenderLib(card){
  var box = card.querySelector('.lp2-lib'); if (!box) return;
  var matches = lpLibMatchesForCard(card);
  if (!matches.length){ box.hidden = true; box.innerHTML = ''; return; }
  var html = '<div class="lp2-lib-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Da biblioteca &middot; ' +
    matches.length + ' tópico' + (matches.length>1?'s':'') + ' nas páginas desta aula</div>';
  matches.forEach(function(t, i){
    var exs = (t.ex||[]).map(function(p){
      return '<li><span class="lp2-lib-en">' + lpLibEsc(p.en) + '</span>' + (p.pt ? ' <span class="lp2-lib-pt">(' + lpLibEsc(p.pt) + ')</span>' : '') + '</li>';
    }).join('');
    html += '<details class="lp2-lib-item"' + (i===0?' open':'') + '><summary><b>' + lpLibEsc(t.topic) + '</b> <span class="lp2-lib-pg">pg ' + t.page + (t.unit ? ' &middot; Unit ' + t.unit : '') + '</span></summary><ul class="lp2-lib-ex">' + exs + '</ul></details>';
  });
  box.innerHTML = html; box.hidden = false;
}
function lpRenderAllLib(){ document.querySelectorAll('#lpRows .lp2-card').forEach(lpRenderLib); }

function lpAddRow() { lpAppendRow({}); lpChainLast(); lpSetDirty(true); lpUpdateCount(); }

function lpRemoveRow(btn) {
  var card = btn.closest('.lp2-card');
  if (card) card.remove();
  if (!document.getElementById('lpRows').children.length) lpAppendRow({});
  lpChainLast();
  lpSetDirty(true); lpUpdateCount();
}

// atualiza o selo quando a data muda
document.addEventListener('change', function(ev){
  var t = ev.target;
  if (t && t.classList && t.classList.contains('lp2-in-date')){
    var card = t.closest('.lp2-card');
    if (card){
      var chip = card.querySelector('.lp2-date');
      if (chip) chip.innerHTML = lpDateChipHTML(t.value);
      card.classList.remove('gen');
      lpRenderSpeakCard(card);
    }
    lpChainLast();
    lpUpdateCount();
  }
});

function lpCollectRows() {
  var out = [];
  document.querySelectorAll('#lpRows .lp2-card').forEach(function(card){
    out.push({
      lesson_date: card.querySelector('.lp2-in-date').value || null,
      topic: card.querySelector('.lp2-in-topic').value,
      objective: card.querySelector('.lp2-in-obj').value,
      pages: card.querySelector('.lp2-in-pages').value,
      homework: card.querySelector('.lp2-in-hw').value,
      last_homework: card.querySelector('.lp2-in-last').value,
      last_auto: card.querySelector('.lp2-in-last').dataset.auto === '1',
      notes: card.querySelector('.lp2-in-notes').value
    });
  });
  return out;
}

function lpUpdateCount(){
  var el = document.getElementById('lpCount');
  if (!el) return;
  var cards = document.querySelectorAll('#lpRows .lp2-card');
  var total = cards.length, filled = 0, gen = 0;
  cards.forEach(function(c){
    if (c.classList.contains('gen')) gen++;
    var t=(c.querySelector('.lp2-in-topic').value||'').trim();
    var o=(c.querySelector('.lp2-in-obj').value||'').trim();
    if (t||o) filled++;
  });
  el.innerHTML = '<b>'+filled+'</b> de <b>'+total+'</b> aula'+(total===1?'':'s')+' preenchida'+(filled===1?'':'s')+
    (gen ? '<br>'+gen+' do schedule deste mês' : '');
  lpUpdateProgress();
}

function lpSetDirty(v) {
  _lpState.dirty = !!v;
  var tag = document.getElementById('lpDirty');
  if (tag) tag.style.display = v ? '' : 'none';
  lpUpdateCount();
}

async function lpRegenerate() {
  if (!_lpState.studentName) return;
  if (!confirm('Gerar as aulas a partir do schedule deste mês? As datas do schedule que você já preencheu serão mantidas; aulas avulsas sem data serão descartadas.')) return;
  var mv = document.getElementById('lpMonth').value;
  var gen = await lpGenerateRowsFromSchedule(_lpState.studentName, mv);
  var current = lpCollectRows();
  var byDate = {};
  current.forEach(function(r){ if (r.lesson_date) byDate[r.lesson_date] = r; });
  var merged = gen.map(function(g){
    var ex = byDate[g.lesson_date];
    if (ex) return { lesson_date:g.lesson_date, topic:ex.topic, objective:ex.objective, pages:ex.pages, homework:ex.homework, last_homework:ex.last_homework, notes:ex.notes, _gen:true };
    return g;
  });
  lpRenderRows(merged);
  lpSetDirty(true);
  showToast(merged.length ? ('Geradas '+merged.length+' aula(s) do schedule.') : 'Nenhuma aula recorrente encontrada neste mês.', merged.length ? 'success' : 'info');
}

async function lpSave() {
  if (!_lpState.studentId || !_lpState.monthKey) { showToast('Selecione aluno e mês.','error'); return; }
  var pgEl = document.getElementById('lpHdrPages');
  var header = {
    book:  document.getElementById('lpHdrBook').value.trim(),
    level: document.getElementById('lpHdrLevel').value.trim(),
    book_pages: pgEl ? (parseInt(pgEl.value, 10) || null) : null,
    notes: ''
  };
  try {
    await saveLessonPlan(currentUser.id, _lpState.studentId, _lpState.monthKey, header, lpCollectRows());
    lpSetDirty(false);
    showToast('Plano salvo!');
  } catch(e) {
    showToast('Erro ao salvar: ' + (e.message||e), 'error');
  }
}

function lpExport() {
  var mv = document.getElementById('lpMonth').value || '';
  var pr = lpComputeProgress();
  var sp = (_lpState.speaking || [])
    .filter(function(n){ return String(n.note_date||'').substring(0,7) === mv; })
    .slice()
    .sort(function(a,b){ return String(a.note_date) < String(b.note_date) ? -1 : 1; });
  var header = {
    student: _lpState.studentName,
    book: document.getElementById('lpHdrBook').value,
    level: document.getElementById('lpHdrLevel').value,
    monthLabel: lpMonthLabelFromValue(mv),
    teacher: (currentUser && currentUser.full_name) || '',
    progress: pr.total ? ('p\u00e1g. ' + pr.maxPage + ' de ' + pr.total + ' (' + pr.pct + '%)') : '',
    speaking: sp
  };
  eaPrintLessonPlan(header, lpCollectRows());
}



// ═══════════════════════════════════════════════════════════════
// 1) HOMEWORK REAL  →  "Last homework" automático
//    Cruza a lista de homeworks realmente enviados (tabela tasks) com a
//    data de cada aula do plano. O enviado NO DIA da aula pertence àquela
//    aula, então vale como "last homework" só a partir da aula seguinte.
// ═══════════════════════════════════════════════════════════════
async function lpLoadHomeworkSent(studentId){
  _lpState.hw = [];
  try { _lpState.hw = (await getTasksSentToStudent(currentUser.id, studentId)) || []; }
  catch(e){ console.error('getTasksSentToStudent', e); _lpState.hw = []; }
  return _lpState.hw;
}

function lpHwBefore(iso){
  var list = _lpState.hw || [];
  var cut  = String(iso || '').substring(0,10);
  if (!cut || !list.length) return null;
  var found = null;                       // lista já vem em ordem cronológica
  for (var i=0;i<list.length;i++){
    var d = String(list[i].sent_at || '').substring(0,10);
    if (!d) continue;
    if (d < cut) found = list[i]; else break;
  }
  return found;
}

function lpFmtShort(iso){
  var p = String(iso || '').substring(0,10).split('-');
  return p.length === 3 ? (p[2] + '/' + p[1]) : '';
}

// selo discreto ao lado do campo indicando de onde veio o valor
function lpSrcBadge(input, kind, meta){
  var box = input.parentNode.querySelector('.lp2-src');
  if (!box) return;
  if (kind === 'real'){
    box.className = 'lp2-src real';
    box.textContent = 'enviado ' + meta;
    box.title = 'Puxado da lista de homework — foi o último enviado antes desta aula.';
  } else if (kind === 'plan'){
    box.className = 'lp2-src plan';
    box.textContent = 'do plano';
    box.title = 'Herdado do Homework planejado na aula anterior.';
  } else if (kind === 'manual'){
    box.className = 'lp2-src manual';
    box.textContent = 'manual ↺';
    box.title = 'Digitado por você. Clique para voltar ao automático.';
  } else {
    box.hidden = true; box.textContent = ''; box.className = 'lp2-src'; return;
  }
  box.hidden = false;
}

// clique no selo "manual" devolve o campo ao modo automático
document.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest ? ev.target.closest('.lp2-src.manual') : null;
  if (!b) return;
  var f = b.parentNode.querySelector('.lp2-in-last');
  if (!f) return;
  f.value = ''; f.dataset.auto = '1';
  lpChainLast(); lpSetDirty(true);
});

// ═══════════════════════════════════════════════════════════════
// 2) COMPLETUDE DO CURSO
//    Total de páginas do livro × páginas planejadas em TODOS os meses
//    do mesmo livro (o mês aberto entra ao vivo, direto do editor).
// ═══════════════════════════════════════════════════════════════
async function lpLoadHistory(studentId){
  _lpState.history = [];
  try { _lpState.history = (await getStudentPlanHistory(currentUser.id, studentId)) || []; }
  catch(e){ console.error('getStudentPlanHistory', e); _lpState.history = []; }
  return _lpState.history;
}

// Padrão = última página mapeada na biblioteca (curriculum-index.js).
// É uma referência do próprio material da escola; o professor ajusta e o
// valor fica salvo no plano, sendo herdado nos meses seguintes.
function lpDefaultBookPages(book){
  var lvl = lpLibLevel(book);
  var idx = window.EA_CURRICULUM_INDEX;
  if (!lvl || !idx || !idx[lvl]) return null;
  var max = 0;
  idx[lvl].forEach(function(t){ if (t.page > max) max = t.page; });
  return max || null;
}

function lpSameBook(a, b){
  var la = lpLibLevel(a), lb = lpLibLevel(b);
  if (la && lb) return la === lb;
  return String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase();
}

function lpSetTotalPages(saved){
  var el = document.getElementById('lpHdrPages');
  if (!el) return;
  var bookEl = document.getElementById('lpHdrBook');
  var book = bookEl ? bookEl.value : '';
  var v = (saved != null && saved !== '') ? (parseInt(saved,10) || 0) : 0;
  if (!v){                                   // herda o último total do mesmo livro
    var h = _lpState.history || [];
    for (var i=h.length-1;i>=0;i--){
      if (h[i].book_pages && lpSameBook(h[i].book, book)){ v = parseInt(h[i].book_pages,10) || 0; break; }
    }
  }
  if (!v) v = lpDefaultBookPages(book) || 0;
  el.value = v ? v : '';
  el.placeholder = String(lpDefaultBookPages(book) || '—');
}

function lpTotalPages(){
  var el = document.getElementById('lpHdrPages');
  var v  = el ? parseInt(el.value,10) : 0;
  if (v > 0) return v;
  var bookEl = document.getElementById('lpHdrBook');
  return lpDefaultBookPages(bookEl ? bookEl.value : '') || 0;
}

function lpAddPages(set, text){
  var p = lpParsePages(text);
  for (var k in p) if (Object.prototype.hasOwnProperty.call(p,k)) set[k] = 1;
}

function lpComputeProgress(){
  var bookEl = document.getElementById('lpHdrBook');
  var book   = bookEl ? bookEl.value : '';
  var total  = lpTotalPages();
  var set = {}, lessons = 0, lessonsWithPages = 0;

  (_lpState.history || []).forEach(function(pl){
    if (String(pl.plan_month||'').substring(0,10) === String(_lpState.monthKey)) return;  // mês aberto vem do editor
    if (!lpSameBook(pl.book, book)) return;
    (pl.entries || []).forEach(function(e){
      if (e.lesson_date) lessons++;
      if ((e.pages||'').trim()){ lessonsWithPages++; lpAddPages(set, e.pages); }
    });
  });

  document.querySelectorAll('#lpRows .lp2-card').forEach(function(c){
    if (c.querySelector('.lp2-in-date').value) lessons++;
    var pg = c.querySelector('.lp2-in-pages').value;
    if ((pg||'').trim()){ lessonsWithPages++; lpAddPages(set, pg); }
  });

  var keys = Object.keys(set).map(Number).filter(function(n){
    return n > 0 && (!total || n <= total + 40);       // descarta números soltos absurdos
  });
  var covered = keys.length;
  var maxPage = keys.length ? Math.max.apply(null, keys) : 0;
  var pct  = (total && maxPage) ? Math.min(100, Math.round(maxPage * 100 / total)) : 0;
  var pace = lessonsWithPages ? (covered / lessonsWithPages) : 0;
  var left = (total && maxPage) ? Math.max(0, total - maxPage) : 0;
  var lessonsLeft = (pace > 0 && left > 0) ? Math.ceil(left / pace) : 0;

  return { total:total, covered:covered, maxPage:maxPage, pct:pct,
           pace:pace, left:left, lessonsLeft:lessonsLeft, lessons:lessons, book:book };
}

function lpUpdateProgress(){
  var box = document.getElementById('lpProg');
  if (!box) return;
  var pr = lpComputeProgress();
  _lpState.progress = pr;
  if (!pr.total){ box.hidden = true; return; }
  box.hidden = false;

  var pctEl = document.getElementById('lpProgPct');
  if (pctEl) pctEl.textContent = pr.pct + '%';
  var fill = document.getElementById('lpProgFill');
  if (fill) fill.style.width = pr.pct + '%';

  var parts = [];
  parts.push('pág. <b>' + pr.maxPage + '</b> de <b>' + pr.total + '</b>');
  parts.push('<b>' + pr.covered + '</b> págs. planejadas');
  if (pr.pace)        parts.push('ritmo <b>' + pr.pace.toFixed(1).replace('.', ',') + '</b> pág/aula');
  if (pr.lessonsLeft) parts.push('≈ <b>' + pr.lessonsLeft + '</b> aula' + (pr.lessonsLeft > 1 ? 's' : '') + ' p/ concluir');
  var st = document.getElementById('lpProgStats');
  if (st) st.innerHTML = parts.join('<span class="lp2-prog-sep">·</span>');
}

// ═══════════════════════════════════════════════════════════════
// 3) SPEAKING — observações do professor por data
//    Mesmo formato do bloco de notas: uma data + uma linha por observação.
// ═══════════════════════════════════════════════════════════════
async function lpLoadSpeaking(studentId){
  _lpState.speaking = []; _lpState.speakOk = true;
  try { _lpState.speaking = (await getSpeakingNotes(currentUser.id, studentId)) || []; }
  catch(e){ console.error('getSpeakingNotes', e); _lpState.speaking = []; _lpState.speakOk = false; }
  return _lpState.speaking;
}

function lpSpBullets(content){
  return String(content || '').split('\n')
    .map(function(l){ return l.replace(/^\s*[-•*]\s*/, '').replace(/\s*;\s*$/, '').trim(); })
    .filter(Boolean);
}

function lpSpNoteFor(iso){
  var d = String(iso || '').substring(0,10);
  if (!d) return null;
  var list = _lpState.speaking || [];
  for (var i=0;i<list.length;i++){
    if (String(list[i].note_date || '').substring(0,10) === d) return list[i];
  }
  return null;
}

function lpSpNorm(s){
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// pontos que se repetem em 2+ blocos — o que merece reforço no plano
function lpSpFocus(){
  var count = {}, label = {};
  (_lpState.speaking || []).forEach(function(n){
    var seen = {};
    lpSpBullets(n.content).forEach(function(b){
      var k = lpSpNorm(b);
      if (!k || k.length < 4 || seen[k]) return;
      seen[k] = 1;
      count[k] = (count[k] || 0) + 1;
      if (!label[k]) label[k] = b;
    });
  });
  return Object.keys(count)
    .filter(function(k){ return count[k] >= 2; })
    .sort(function(a,b){ return count[b] - count[a]; })
    .slice(0, 6)
    .map(function(k){ return { text: label[k], n: count[k] }; });
}

function lpSpDefaultDate(){
  var t = new Date();
  var today = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  var best = '';
  document.querySelectorAll('#lpRows .lp2-in-date').forEach(function(i){
    var v = i.value;
    if (v && v <= today && v > best) best = v;
  });
  return best || today;
}

function lpSpSyncEditor(){
  var di = document.getElementById('lpSpDate'), ta = document.getElementById('lpSpText');
  if (!di || !ta) return;
  var n = lpSpNoteFor(di.value);
  ta.value = n ? (n.content || '') : '';
  var hint = document.getElementById('lpSpEditing');
  if (hint){
    if (n){ hint.textContent = 'editando o bloco de ' + lpFmtShort(n.note_date); hint.hidden = false; }
    else   { hint.hidden = true; }
  }
}

function lpSpOpen(iso){
  var body = document.getElementById('lpSpBody');
  if (body && body.hidden) lpSpToggle();
  var di = document.getElementById('lpSpDate');
  if (di && iso) di.value = String(iso).substring(0,10);
  lpSpSyncEditor();
  var box = document.getElementById('lpSpeak');
  if (box && box.scrollIntoView) box.scrollIntoView({ behavior:'smooth', block:'center' });
  var ta = document.getElementById('lpSpText');
  if (ta) setTimeout(function(){ ta.focus(); }, 250);
}

function lpSpFromCard(btn){
  var card = btn.closest('.lp2-card');
  if (!card) return;
  lpSpOpen(card.querySelector('.lp2-in-date').value || lpSpDefaultDate());
}

function lpSpToggle(){
  var body = document.getElementById('lpSpBody');
  var box  = document.getElementById('lpSpeak');
  if (!body) return;
  body.hidden = !body.hidden;
  if (box) box.classList.toggle('open', !body.hidden);
}

async function lpSpSave(){
  if (!_lpState.studentId){ showToast('Selecione um aluno.', 'error'); return; }
  var di = document.getElementById('lpSpDate'), ta = document.getElementById('lpSpText');
  if (!di || !ta) return;
  var d = di.value;
  if (!d){ showToast('Escolha a data das observações.', 'error'); return; }
  var btn = document.getElementById('lpSpSaveBtn');
  if (btn) btn.disabled = true;
  try {
    var saved = await saveSpeakingNote(currentUser.id, _lpState.studentId, d, ta.value);
    var list = (_lpState.speaking || []).filter(function(n){
      return String(n.note_date || '').substring(0,10) !== d;
    });
    if (saved) list.push(saved);
    list.sort(function(a,b){ return String(a.note_date) < String(b.note_date) ? 1 : -1; });
    _lpState.speaking = list;
    _lpState.speakOk = true;
    lpRenderSpeakPanel();
    showToast(saved ? 'Observações salvas!' : 'Observações removidas.');
  } catch(e){
    showToast('Erro ao salvar observações: ' + (e.message || e), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function lpRenderSpeakPanel(){
  var box = document.getElementById('lpSpeak');
  if (!box) return;
  box.hidden = false;
  var list = _lpState.speaking || [];

  var cnt = document.getElementById('lpSpCount');
  if (cnt){
    cnt.textContent = (_lpState.speakOk === false)
      ? 'indisponível'
      : (list.length ? (list.length + (list.length > 1 ? ' registros' : ' registro')) : 'nenhum registro ainda');
  }

  var f = document.getElementById('lpSpFocus');
  if (f){
    var foc = lpSpFocus();
    if (foc.length){
      f.innerHTML = '<span class="lp2-sp-flab">Focos recorrentes</span>' + foc.map(function(x){
        return '<span class="lp2-sp-tag">' + lpLibEsc(x.text) + '<i>' + x.n + '\u00d7</i></span>';
      }).join('');
      f.hidden = false;
    } else { f.hidden = true; f.innerHTML = ''; }
  }

  var ul = document.getElementById('lpSpList');
  if (ul){
    if (_lpState.speakOk === false){
      ul.innerHTML = '<div class="lp2-sp-empty">Não foi possível carregar as observações. Rode <b>lesson_plans_v2.sql</b> no Supabase.</div>';
    } else if (!list.length){
      ul.innerHTML = '<div class="lp2-sp-empty">Nenhuma observação registrada para este aluno ainda.</div>';
    } else {
      ul.innerHTML = list.map(function(n){
        var d = String(n.note_date || '').substring(0,10);
        return '<div class="lp2-sp-item">' +
            '<div class="lp2-sp-d">' + lpFmtShort(d) + '</div>' +
            '<ul>' + lpSpBullets(n.content).map(function(x){ return '<li>' + lpLibEsc(x) + '</li>'; }).join('') + '</ul>' +
            '<button type="button" class="lp2-sp-edit" onclick="lpSpOpen(\'' + d + '\')">editar</button>' +
          '</div>';
      }).join('');
    }
  }

  var di = document.getElementById('lpSpDate');
  if (di && !di.value) di.value = lpSpDefaultDate();
  lpSpSyncEditor();
  document.querySelectorAll('#lpRows .lp2-card').forEach(lpRenderSpeakCard);
}

// bloco compacto dentro do cartão da aula, quando há observações naquela data
function lpRenderSpeakCard(card){
  var box = card.querySelector('.lp2-spnote');
  if (!box) return;
  var n = lpSpNoteFor(card.querySelector('.lp2-in-date').value);
  if (!n){ box.hidden = true; box.innerHTML = ''; return; }
  var b = lpSpBullets(n.content);
  if (!b.length){ box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = '<details class="lp2-spnote-d"><summary>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>' +
      'Speaking desta aula <span>' + b.length + '</span></summary>' +
      '<ul>' + b.map(function(x){ return '<li>' + lpLibEsc(x) + '</li>'; }).join('') + '</ul>' +
    '</details>';
  box.hidden = false;
}
