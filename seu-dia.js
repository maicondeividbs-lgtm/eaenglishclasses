/* ═══════════════════════════════════════════════════════════════
   SEU DIA — painel de visão geral (professor e coordenação)

   Monta a agenda REAL de hoje: a grade recorrente (schedule_slots)
   cruzada com os eventos da data (schedule_events) e com o calendário
   de feriados. Cada aula mostra o que vai ser dado (tópico + páginas,
   vindos de lesson_plan_entries) e o estado do plano.

   Uso:
     EA_DIA.mount('teacher')  → dashboard-professor
     EA_DIA.mount('coord')    → dashboard-coordenacao (escola inteira)

   Degrada com elegância: se um bloco não tem dados ou a consulta falha,
   ele some em vez de quebrar o painel.
   ═══════════════════════════════════════════════════════════════ */

var EA_DIA = (function(){
  'use strict';

  var WD = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  var MO = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var DIAS_SEM_AULA = 21;   // limite para considerar um aluno "sem aula há tempo"
  var DIAS_ANIVER   = 14;   // janela de aniversários próximos

  var S = { mode:'teacher', today:'', data:null };

  // ── utilidades ────────────────────────────────────────────────
  function esc(x){
    return String(x == null ? '' : x)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function iso(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function parseISO(s){
    var p = String(s||'').substring(0,10).split('-');
    return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
  }
  function daysBetween(a, b){
    return Math.round((parseISO(b) - parseISO(a)) / 86400000);
  }
  function norm(s){
    return String(s||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  // schedule_slots.day_of_week: seg=0 … sáb=5, dom=6
  function schedDay(jsDay){ return (jsDay + 6) % 7; }
  function hhmm(t){ return String(t||'').slice(0,5); }
  function plural(n, um, muitos){ return n + ' ' + (n === 1 ? um : muitos); }

  function el(id){ return document.getElementById(id); }
  function setHTML(id, html){ var e = el(id); if (e) e.innerHTML = html; }

  // Acende ou apaga um painel inteiro e atualiza o contador do cabeçalho.
  // Os blocos usam o mesmo .panel/.panel-head do resto do dashboard, então
  // quem some é o painel, não só a lista de dentro.
  function painel(panelId, listId, countId, itens, html){
    var pan = el(panelId), lst = el(listId), cnt = el(countId);
    if (lst) lst.innerHTML = itens ? html : '';
    if (cnt) cnt.textContent = itens;
    if (pan) pan.hidden = !itens;
  }

  // ── carga de dados ────────────────────────────────────────────
  async function load(){
    var hoje = new Date();
    S.today = iso(hoje);
    var desde = new Date(hoje.getTime() - 70*86400000);

    var isCoord = (S.mode === 'coord');
    var teacherIds = [], profiles = [], slots = [], events = [], entries = [];

    if (isCoord) {
      profiles = await safe(getProfilesForDayPanel(null), []);
      teacherIds = profiles.filter(function(p){
        return p.role === 'teacher' || p.role === 'coordinator';
      }).map(function(p){ return p.id; });
    } else {
      teacherIds = [currentUser.id];
      var meus = window._myStudents;
      if (!meus || !meus.length) meus = await safe(getMyStudents(currentUser.id), []);
      window._myStudents = meus;
      var ids = meus.map(function(s){ return s.id; }).concat([currentUser.id]);
      profiles = await safe(getProfilesForDayPanel(ids), []);
    }

    if (teacherIds.length) {
      slots = isCoord
        ? await safe(getScheduleSlotsMulti(teacherIds), [])
        : await safe(getScheduleSlots(currentUser.id), []);
      events  = await safe(getScheduleEventsRange(teacherIds, iso(desde), S.today), []);
      entries = await safe(getLessonEntriesForDate(teacherIds, S.today), []);
    }

    S.data = {
      isCoord: isCoord,
      profiles: profiles,
      slots: slots || [],
      events: events || [],
      entries: entries || [],
      teacherNames: nameMap(profiles),
      students: (window._myStudents || [])
    };
    return S.data;
  }

  function safe(p, fallback){
    return Promise.resolve(p).catch(function(e){ console.error('[seu-dia]', e); return fallback; });
  }
  function nameMap(profiles){
    var m = {};
    (profiles||[]).forEach(function(p){ m[p.id] = p.full_name || ''; });
    return m;
  }

  // ── agenda de hoje ────────────────────────────────────────────
  // Grade recorrente do dia da semana + eventos da data. Um evento de
  // cancelamento derruba a aula; uma reposição/extra acrescenta uma.
  function buildAgenda(){
    var d = S.data, hoje = S.today;
    var dow = schedDay(new Date().getDay());
    var evHoje = d.events.filter(function(e){ return String(e.event_date).substring(0,10) === hoje; });

    var linhas = d.slots.filter(function(s){ return s.day_of_week === dow; }).map(function(s){
      var ev = evHoje.filter(function(e){
        if (e.slot_id && s.id && String(e.slot_id) === String(s.id)) return true;
        if (!e.slot_id && e.student_name && norm(e.student_name) === norm(s.student_name)) return true;
        return false;
      })[0] || null;
      return linha(s, ev);
    });

    // eventos avulsos do dia que não pertencem a nenhum slot da grade
    evHoje.forEach(function(e){
      var jaTem = linhas.some(function(l){ return l.ev === e; });
      if (jaTem) return;
      if (e.event_type === 'replacement' || e.event_type === 'note') {
        linhas.push({
          time: hhmm(e.replacement_time) || '',
          name: e.student_name || (e.event_type === 'note' ? 'Observação' : 'Reposição'),
          duration: 60,
          teacher_id: e.teacher_id,
          estado: e.event_type === 'replacement' ? 'reposicao' : 'nota',
          motivo: e.notes || '',
          slot: null, ev: e
        });
      }
    });

    linhas.sort(function(a,b){ return (a.time||'99') < (b.time||'99') ? -1 : 1; });
    linhas.forEach(anexaPlano);
    return linhas;
  }

  function linha(s, ev){
    var estado = 'normal', motivo = '';
    if (ev) {
      motivo = ev.notes || '';
      if (ev.event_type === 'cancellation') estado = 'cancelada';
      else if (ev.event_type === 'replacement') estado = 'reposicao';
      else if (ev.event_type === 'note') estado = 'nota';
    }
    return {
      time: hhmm(s.time_slot),
      name: s.student_name || 'Aluno',
      duration: s.duration_minutes || 60,
      teacher_id: s.teacher_id,
      estado: estado,
      motivo: motivo,
      slot: s, ev: ev || null
    };
  }

  // Liga a linha da agenda ao plano de aula da data (tópico + páginas).
  // schedule_slots identifica o aluno por nome; lesson_plans por id.
  function anexaPlano(l){
    var d = S.data;
    var sid = (l.slot && l.slot.student_id) || idPorNome(l.name);
    var e = null;
    for (var i=0;i<d.entries.length;i++){
      var c = d.entries[i];
      if (sid && String(c.student_id) === String(sid)) { e = c; break; }
    }
    l.student_id = sid || null;
    l.plano = e;
    l.temPlano = !!(e && ((e.topic||'').trim() || (e.pages||'').trim() || (e.objective||'').trim()));
  }

  // schedule_slots guarda o nome digitado pelo professor ("Bruna"), enquanto
  // lesson_plans usa o id do perfil ("Bruna Martins"). Casa exato primeiro e,
  // se nao achar, aceita prefixo — desde que so um perfil bata.
  function idPorNome(nome){
    var d = S.data, n = norm(nome);
    if (!n) return null;
    var lista = (d.students && d.students.length) ? d.students : d.profiles;
    var i;
    for (i=0;i<lista.length;i++){
      if (norm(lista[i].full_name) === n) return lista[i].id;
    }
    var cand = [];
    for (i=0;i<lista.length;i++){
      var f = norm(lista[i].full_name);
      if (!f) continue;
      if (f.indexOf(n + ' ') === 0 || n.indexOf(f + ' ') === 0) cand.push(lista[i].id);
    }
    return cand.length === 1 ? cand[0] : null;
  }

  // ── alunos sem aula há tempo ──────────────────────────────────
  // Última aula efetiva = data retroativa mais recente em que havia
  // horário na grade E não houve cancelamento registrado naquele dia.
  function semAula(){
    var d = S.data, hoje = parseISO(S.today), out = [];
    var porAluno = {};

    d.slots.forEach(function(s){
      var k = norm(s.student_name);
      if (!k) return;
      (porAluno[k] = porAluno[k] || { nome: s.student_name, slots: [], teacher_id: s.teacher_id }).slots.push(s);
    });

    var cancel = {};
    d.events.forEach(function(e){
      if (e.event_type !== 'cancellation') return;
      var k = norm(e.student_name);
      cancel[k + '|' + String(e.event_date).substring(0,10)] = true;
    });

    Object.keys(porAluno).forEach(function(k){
      var a = porAluno[k], ultima = null;
      for (var back = 0; back <= 70; back++){
        var dt = new Date(hoje.getTime() - back*86400000);
        var dow = schedDay(dt.getDay());
        var temSlot = a.slots.some(function(s){ return s.day_of_week === dow; });
        if (!temSlot) continue;
        if (cancel[k + '|' + iso(dt)]) continue;
        ultima = iso(dt);
        break;
      }
      var dias = ultima ? daysBetween(ultima, S.today) : 999;
      if (dias >= DIAS_SEM_AULA) {
        out.push({ nome: a.nome, dias: dias, nunca: !ultima, teacher_id: a.teacher_id });
      }
    });

    return out.sort(function(x,y){ return y.dias - x.dias; }).slice(0, 6);
  }

  // ── aniversários (alunos e equipe) ────────────────────────────
  function aniversarios(){
    var d = S.data, hoje = parseISO(S.today), out = [];
    d.profiles.forEach(function(p){
      if (!p.birthday) return;
      var b = parseISO(p.birthday);
      var prox = new Date(hoje.getFullYear(), b.getMonth(), b.getDate());
      if (daysBetween(S.today, iso(prox)) < 0) prox.setFullYear(prox.getFullYear() + 1);
      var dias = daysBetween(S.today, iso(prox));
      if (dias >= 0 && dias <= DIAS_ANIVER) {
        out.push({ nome: p.full_name, dias: dias, role: p.role, dia: b.getDate(), mes: b.getMonth() });
      }
    });
    return out.sort(function(a,b){ return a.dias - b.dias; }).slice(0, 8);
  }

  // ── render ────────────────────────────────────────────────────
  function render(){
    var d = S.data;
    if (!d) return;
    var agenda = buildAgenda();
    renderHero(agenda);
    renderAgenda(agenda);
    renderAtencao();
    renderAniver();
  }

  function saudacao(){
    var h = new Date().getHours();
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  }

  function renderHero(agenda){
    var hoje = parseISO(S.today);
    var fer = (typeof checkFeriado === 'function') ? checkFeriado(S.today) : null;
    var nome = ((currentUser && currentUser.full_name) || '').split(' ')[0] || '';

    setHTML('diaData', WD[hoje.getDay()] + ', ' + hoje.getDate() + ' de ' + MO[hoje.getMonth()]);
    setHTML('diaOla', esc(saudacao() + (nome ? ', ' + nome : '')));

    var ativas = agenda.filter(function(l){ return l.estado !== 'cancelada' && l.estado !== 'nota'; });
    var canc   = agenda.filter(function(l){ return l.estado === 'cancelada'; });
    var planos = ativas.filter(function(l){ return l.temPlano; });

    var bits = [];
    bits.push('<b>' + ativas.length + '</b> ' + (ativas.length === 1 ? 'aula' : 'aulas'));
    if (canc.length)   bits.push('<b>' + canc.length + '</b> cancelada' + (canc.length > 1 ? 's' : ''));
    if (ativas.length) bits.push('<b>' + planos.length + '</b> de <b>' + ativas.length + '</b> com plano pronto');
    setHTML('diaResumo', bits.join('<span class="dia-sep">·</span>'));

    var b = el('diaFeriado');
    if (b) {
      if (fer) {
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M4.9 4.9l4.2 4.2M2 12h6M19.1 4.9l-4.2 4.2M22 12h-6"/><path d="M6 22h12l-2-8H8z"/></svg>' +
          esc(fer.nome) + ' <em>' + esc(fer.tipo) + '</em>';
        b.hidden = false;
      } else b.hidden = true;
    }
  }

  function badge(l){
    if (l.estado === 'cancelada') return '<span class="dia-tag canc">cancelada</span>';
    if (l.estado === 'reposicao') return '<span class="dia-tag rep">reposição</span>';
    if (l.estado === 'nota')      return '<span class="dia-tag nota">observação</span>';
    return l.temPlano ? '<span class="dia-tag ok">plano pronto</span>'
                      : '<span class="dia-tag pend">sem plano</span>';
  }

  function renderAgenda(agenda){
    var box = el('diaAgenda');
    if (!box) return;
    var cnt = el('diaAgendaCount');
    if (cnt) cnt.textContent = agenda.length;

    if (!agenda.length) {
      var dom = new Date().getDay() === 0;
      box.innerHTML = '<div class="dia-vazio">' +
        (dom ? 'Domingo — sem aulas.' : 'Nenhuma aula na grade para hoje.') + '</div>';
      return;
    }

    box.innerHTML = agenda.map(function(l){
      var p = l.plano || {};
      var det = [];
      if ((p.topic || '').trim()) det.push('<span class="dia-topico">' + esc(p.topic) + '</span>');
      if ((p.pages || '').trim()) det.push('<span class="dia-pgs">págs. ' + esc(p.pages) + '</span>');
      if (!det.length && (p.objective || '').trim()) det.push('<span class="dia-topico">' + esc(p.objective) + '</span>');
      if (!det.length && l.estado === 'normal') det.push('<span class="dia-nada">Plano ainda não preenchido</span>');
      if (l.motivo) det.push('<span class="dia-motivo">' + esc(l.motivo) + '</span>');

      var prof = (S.data.isCoord && l.teacher_id && S.data.teacherNames[l.teacher_id])
        ? '<span class="dia-prof">' + esc(S.data.teacherNames[l.teacher_id]) + '</span>' : '';

      var click = l.student_id
        ? ' data-sid="' + esc(l.student_id) + '" data-sname="' + esc(l.name) + '" onclick="eaDiaAbrirAluno(this)"'
        : '';

      return '<div class="dia-aula ' + l.estado + '"' + click + '>' +
          '<div class="dia-hora">' + esc(l.time || '—') + '<em>' + l.duration + 'min</em></div>' +
          '<div class="dia-main">' +
            '<div class="dia-nome">' + esc(l.name) + prof + '</div>' +
            (det.length ? '<div class="dia-det">' + det.join('<span class="dia-sep">·</span>') + '</div>' : '') +
          '</div>' +
          badge(l) +
        '</div>';
    }).join('');
  }

  // Contratos ficam fora daqui de propósito: são assunto da coordenação,
  // que tem o painel próprio (contractAlerts). O professor não vê.
  function renderAtencao(){
    var sem = semAula();
    painel('diaSemAulaPanel', 'diaAtencao', 'diaSemAulaCount', sem.length,
      sem.map(function(a){
        return '<div class="dia-li"><span class="dia-li-n">' + esc(a.nome) + '</span>' +
          '<span class="dia-li-t warn">' + (a.nunca ? 'nenhuma registrada' : 'há ' + plural(a.dias, 'dia', 'dias')) + '</span></div>';
      }).join(''));
  }

  function renderAniver(){
    var lista = aniversarios();
    painel('diaAniverPanel', 'diaAniver', 'diaAniverCount', lista.length,
      lista.map(function(a){
        var q = a.dias === 0 ? 'hoje' : (a.dias === 1 ? 'amanhã' : 'em ' + a.dias + ' dias');
        var papel = a.role === 'student' ? 'aluno' : (a.role === 'coordinator' ? 'coordenação' : 'professor');
        return '<div class="dia-li' + (a.dias === 0 ? ' hoje' : '') + '">' +
          '<span class="dia-li-n">' + esc(a.nome) + '<em>' + papel + '</em></span>' +
          '<span class="dia-li-t' + (a.dias === 0 ? ' hoje' : '') + '">' + q + '</span></div>';
      }).join(''));
  }

  // ── público ───────────────────────────────────────────────────
  async function mount(mode){
    S.mode = (mode === 'coord') ? 'coord' : 'teacher';
    if (!el('diaAgenda')) return;
    try {
      await load();
      render();
    } catch(e){
      console.error('[seu-dia] mount', e);
      setHTML('diaAgenda', '<div class="dia-vazio">Não foi possível carregar a agenda de hoje.</div>');
    }
  }

  return { mount: mount, render: render, state: S };
})();

// abre o detalhe do aluno a partir de uma linha da agenda, quando o
// dashboard hospedeiro oferece essa função
function eaDiaAbrirAluno(elm){
  var sid = elm.dataset.sid, nome = elm.dataset.sname;
  if (typeof openStudentDetail === 'function') openStudentDetail(sid, nome);
}
