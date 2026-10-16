/* ═══════════════════════════════════════════════════════════════
   WIN — painéis no celular
   1) Gaveta do menu: botão de fechar, fecha ao escolher um item,
      ao arrastar para a esquerda e com Esc; trava a rolagem do fundo.
   2) Grade (schedule) EDITÁVEL no celular — professor e coordenação.
      Antes era só leitura ("use um computador"). Agora:
        • "+ Aula" em cada dia → aluno, horário e duração
        • tocar numa aula → duração, eventos (o pop-up de sempre)
          e, embaixo, mover para outro dia/horário ou remover
      Usa as mesmas funções do computador (addScheduleSlot,
      removeScheduleSlot, pop-ups e recarga), então o banco recebe
      exatamente o mesmo que receberia arrastando na grade.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MQ = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };
  function mobile() { return MQ.matches; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }

  // ── 1) GAVETA ───────────────────────────────────────────────
  function setupDrawer() {
    var sb = document.querySelector('.sb');
    var ov = document.getElementById('sbOverlay');
    if (!sb) return;
    function close() {
      sb.classList.remove('open');
      if (ov) ov.classList.remove('open');
    }
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'win-sb-close'; x.setAttribute('aria-label', 'Fechar menu'); x.textContent = '✕';
    x.addEventListener('click', close);
    sb.appendChild(x);
    function syncX() { x.style.display = mobile() ? '' : 'none'; }
    syncX(); if (MQ.addEventListener) MQ.addEventListener('change', syncX);

    // trava a rolagem do fundo enquanto a gaveta está aberta
    new MutationObserver(function () {
      document.body.classList.toggle('win-menu-open', sb.classList.contains('open') && mobile());
    }).observe(sb, { attributes: true, attributeFilter: ['class'] });

    sb.addEventListener('click', function (e) {
      if (!mobile()) return;
      var link = e.target.closest('.sb-link, .sb-bottom a');
      if (link) setTimeout(close, 60);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sb.classList.contains('open')) close(); });
    var x0 = null, y0 = null;
    sb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    sb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (dx < -60 && Math.abs(dy) < 50) close();
      x0 = null;
    }, { passive: true });
  }

  // ── 2) GRADE NO CELULAR ─────────────────────────────────────
  var DAY_NAMES = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var cfg = null;       // depende do painel
  var cache = { slots: [], students: [] };
  var form = { day: 0, dur: 60 };

  function toMin(t) { var p = String(t || '').substring(0, 5).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function overlap(aT, aD, bT, bD) { var a = toMin(aT), b = toMin(bT); return a < b + (bD || 60) && b < a + (aD || 60); }

  async function conflict(teacherId, name, day, time, dur, excludeId) {
    // (a) mesmo professor, horário sobreposto
    for (var i = 0; i < cache.slots.length; i++) {
      var s = cache.slots[i];
      if (excludeId && String(s.id) === String(excludeId)) continue;
      if (s.day_of_week === day && overlap(time, dur, s.time_slot, s.duration_minutes)) return 'Conflito: sobrepõe a aula de ' + s.student_name + '.';
    }
    // (b) o aluno já tem aula com outro professor no horário
    try {
      var r = await db.from('schedule_slots').select('id,teacher_id,time_slot,duration_minutes').eq('student_name', name).eq('day_of_week', day);
      var list = (r && r.data) || [];
      for (var j = 0; j < list.length; j++) {
        var o = list[j];
        if (excludeId && String(o.id) === String(excludeId)) continue;
        if (String(o.teacher_id) !== String(teacherId) && overlap(time, dur, o.time_slot, o.duration_minutes)) return name + ' já tem aula com outro professor nesse horário.';
      }
    } catch (e) { /* sem rede: não bloqueia */ }
    return null;
  }

  function hoursOptions(sel) {
    var H = cfg.hours() || [];
    return H.map(function (h) { return '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + h + '</option>'; }).join('');
  }
  function durButtons(cur) {
    return '<div class="win-sm-dur" role="group" aria-label="Duração">' + [30, 60, 90].map(function (d) {
      return '<button type="button" data-dur="' + d + '" class="' + (d === cur ? 'on' : '') + '" onclick="WIN_SM.dur(' + d + ',this)">' + d + ' min</button>';
    }).join('') + '</div>';
  }

  function render(slots, evts) {
    var box = document.getElementById(cfg.bodyId);
    if (!box) return;
    cache.slots = slots || [];
    if (!cfg.teacherId()) { box.innerHTML = '<div class="sched-day-empty">Selecione um professor.</div>'; return; }
    var html = '';
    for (var di = 0; di < DAY_NAMES.length; di++) {
      var items = [];
      cache.slots.forEach(function (s, idx) {
        if (s.day_of_week === di && s.time_slot) items.push({ k: 'c', t: s.time_slot.substring(0, 5), s: s, idx: idx });
      });
      (evts || []).forEach(function (ev) {
        var gm = (ev.notes || '').match(/\[GRID:(\d+):(\d{2}:\d{2})/);
        if (!gm || parseInt(gm[1], 10) !== di) return;
        items.push({ k: 'e', t: gm[2], ev: ev });
      });
      items.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });

      var body = '';
      if (!items.length) body = '<div class="sched-day-empty">Sem aulas</div>';
      items.forEach(function (it) {
        if (it.k === 'e') {
          var ev = it.ev;
          var lbl = ev.event_type === 'cancellation' ? 'Cancelamento' : ev.event_type === 'replacement' ? 'Reposição' : 'Evento';
          body += '<div class="sched-m-class sched-m-event"><div class="sched-m-time">' + it.t + '</div>' +
            '<div class="sched-m-info"><span class="sched-m-name">' + (ev.event_type === 'cancellation' ? '❌ ' : '🔄 ') + esc(ev.student_name || 'Geral') + '</span>' +
            '<span class="sched-m-level">' + lbl + (ev.event_date && typeof formatDate === 'function' ? ' — ' + formatDate(ev.event_date) : '') + '</span></div></div>';
        } else {
          var s = it.s, c = cfg.color(s.student_name) || {};
          var dur = s.duration_minutes || 60;
          body += '<div class="sched-m-class win-sm-item" role="button" tabindex="0" data-sm="' + it.idx + '" style="background:' + (c.bg || '') + ';border-color:' + (c.b || '') + ';color:' + (c.t || '') + '">' +
            '<div class="sched-m-time">' + it.t + '</div>' +
            '<div class="sched-m-info"><span class="sched-m-name">' + esc(s.student_name) + '</span>' +
            '<span class="sched-m-level">' + esc(s.student_level || '') + (dur !== 60 ? ' · ' + dur + 'min' : '') + '</span></div></div>';
        }
      });
      var n = items.filter(function (i) { return i.k === 'c'; }).length;
      html += '<div class="sched-day-card"><div class="sched-day-head"><span>' + DAY_NAMES[di] + '</span>' +
        '<span class="sched-day-count">' + n + (n === 1 ? ' aula' : ' aulas') + '</span>' +
        '<button type="button" class="win-sm-add" onclick="WIN_SM.openAdd(' + di + ')" aria-label="Adicionar aula na ' + DAY_NAMES[di] + '">+ Aula</button></div>' +
        '<div class="sched-day-body">' + body + '</div></div>';
    }
    box.innerHTML = html;
  }

  async function students() {
    if (cache.students.length && cache.studentsFor === cfg.teacherId()) return cache.students;
    var list = [];
    try { list = await getMyStudents(cfg.teacherId()); } catch (e) {}
    cache.students = list || []; cache.studentsFor = cfg.teacherId();
    return cache.students;
  }

  async function openAdd(day) {
    form = { day: day, dur: 60 };
    var list = await students();
    var opts = list.map(function (s, i) {
      return '<option value="' + i + '">' + esc(s.full_name) + '</option>';
    }).join('');
    var html = '<div class="win-sm-form">' +
      (list.length ? '' : '<p class="win-sm-hint">Nenhum aluno vinculado a este professor.</p>') +
      '<label for="winSmStudent">Aluno</label><select id="winSmStudent">' + opts + '</select>' +
      '<div class="win-sm-row"><div><label for="winSmDay">Dia</label><select id="winSmDay">' +
        DAY_NAMES.map(function (n, i) { return '<option value="' + i + '"' + (i === day ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select></div><div><label for="winSmTime">Horário</label><select id="winSmTime">' + hoursOptions('08:00') + '</select></div></div>' +
      '<label>Duração</label>' + durButtons(60) +
      '<button type="button" class="win-sm-pri" onclick="WIN_SM.add()"' + (list.length ? '' : ' disabled') + '>Adicionar aula</button>' +
      '<button type="button" class="win-sm-sec" onclick="WIN_SM.extra()">Registrar evento extra neste horário</button>' +
      '</div>';
    cfg.show('Nova aula — ' + DAY_NAMES[day], html);
  }

  function dur(d, btn) {
    form.dur = d;
    var wrap = btn && btn.parentNode;
    if (wrap) wrap.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-dur') === d); });
  }

  async function add() {
    var list = cache.students;
    var si = document.getElementById('winSmStudent');
    var st = list[+(si && si.value)];
    if (!st) { toast('Escolha o aluno', 'error'); return; }
    var day = +document.getElementById('winSmDay').value;
    var time = document.getElementById('winSmTime').value;
    var level = st.course_name || (st.course && st.course.name) || st.level || '';
    var msg = await conflict(cfg.teacherId(), st.full_name, day, time, form.dur, null);
    if (msg) { toast('⚠️ ' + msg, 'error'); return; }
    try {
      await addScheduleSlot(cfg.teacherId(), day, time + ':00', st.full_name, level, form.dur);
      cfg.close(); cfg.sound(); toast('Aula adicionada!'); cfg.reload();
    } catch (e) { toast('Erro ao adicionar', 'error'); }
  }

  function extra() {
    var day = +document.getElementById('winSmDay').value;
    var time = document.getElementById('winSmTime').value;
    cfg.show('📌 Evento — ' + DAY_NAMES[day] + ' ' + time, cfg.extraPopup(day, time));
  }

  function openSlot(idx) {
    var s = cache.slots[idx];
    if (!s) return;
    var dur = s.duration_minutes || 60, time = (s.time_slot || '').substring(0, 5);
    var base = '';
    try { base = cfg.slotPopup(String(s.id), s.student_name, String(dur), s.day_of_week, time); } catch (e) { base = ''; }
    var move = '<hr class="win-sm-sep"><div class="win-sm-form">' +
      '<label>Mover para</label>' +
      '<div class="win-sm-row"><div><select id="winSmMvDay" aria-label="Dia">' +
        DAY_NAMES.map(function (n, i) { return '<option value="' + i + '"' + (i === s.day_of_week ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select></div><div><select id="winSmMvTime" aria-label="Horário">' + hoursOptions(time) + '</select></div></div>' +
      '<button type="button" class="win-sm-sec" onclick="WIN_SM.move(' + idx + ')">Mover aula</button>' +
      '<button type="button" class="win-sm-danger" onclick="WIN_SM.remove(' + idx + ')">Remover esta aula da grade</button></div>';
    cfg.show(s.student_name + ' · ' + DAY_NAMES[s.day_of_week] + ' ' + time, base + move);
  }

  async function move(idx) {
    var s = cache.slots[idx];
    if (!s) return;
    var day = +document.getElementById('winSmMvDay').value;
    var time = document.getElementById('winSmMvTime').value;
    if (day === s.day_of_week && time === (s.time_slot || '').substring(0, 5)) { toast('Escolha outro dia ou horário', 'error'); return; }
    var dur = s.duration_minutes || 60;
    var msg = await conflict(cfg.teacherId(), s.student_name, day, time, dur, s.id);
    if (msg) { toast('⚠️ ' + msg, 'error'); return; }
    try {
      await removeScheduleSlot(parseInt(s.id, 10));
      await addScheduleSlot(cfg.teacherId(), day, time + ':00', s.student_name, s.student_level || '', dur);
      cfg.close(); cfg.sound(); toast('Aula movida!'); cfg.reload();
    } catch (e) { toast('Erro ao mover', 'error'); }
  }

  async function remove(idx) {
    var s = cache.slots[idx];
    if (!s || !confirm('Remover a aula de ' + s.student_name + ' da grade?')) return;
    try { await removeScheduleSlot(parseInt(s.id, 10)); cfg.close(); cfg.sound(); toast('Aula removida!'); cfg.reload(); }
    catch (e) { toast('Erro ao remover', 'error'); }
  }

  function setupSchedule() {
    var isProf = typeof renderSchedMobile === 'function' && document.getElementById('profSchedMobileBody');
    var isCoord = typeof renderCoordSchedMobile === 'function' && document.getElementById('coordSchedMobileBody');
    if (isProf) {
      cfg = {
        bodyId: 'profSchedMobileBody',
        teacherId: function () { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null; },
        hours: function () { return typeof P_HOURS !== 'undefined' ? P_HOURS : []; },
        color: function (n) { try { return gc(n); } catch (e) { return {}; } },
        show: function (t, h) { showPopup(t, h); },
        close: function () { closePopup(); },
        reload: function () { loadSchedule(); },
        sound: function () { try { popSnd(); } catch (e) {} },
        slotPopup: function (a, b, c, d, e) { return buildSlotPopup(a, b, c, d, e); },
        extraPopup: function (d, h) { return buildExtraPopup(d, h); }
      };
      window.renderSchedMobile = render;          // substitui a lista só-leitura
      try { renderSchedMobile = render; } catch (e) {}
    } else if (isCoord) {
      cfg = {
        bodyId: 'coordSchedMobileBody',
        teacherId: function () { return (typeof cTeacherId !== 'undefined') ? cTeacherId : null; },
        hours: function () { return typeof C_HOURS !== 'undefined' ? C_HOURS : []; },
        color: function (n) { try { return cGc(n); } catch (e) { return {}; } },
        show: function (t, h) { showCPop(t, h); },
        close: function () { closeCPop(); },
        reload: function () { loadCoordSchedule(); },
        sound: function () { try { cPop(); } catch (e) {} },
        slotPopup: function (a, b, c, d, e) { return buildCSlotPopup(a, b, c, d, e); },
        extraPopup: function (d, h) { return buildCExtraPopup(d, h); }
      };
      window.renderCoordSchedMobile = render;
      try { renderCoordSchedMobile = render; } catch (e) {}
    } else return;

    if (mobile()) document.querySelectorAll('#sec-schedule .section-sub, #sec-schedules .section-sub').forEach(function (p) {
      p.textContent = 'Monte a grade da semana e registre cancelamentos, reposições e eventos do mês.';
    });
    document.querySelectorAll('.sched-mobile-note').forEach(function (n) {
      n.innerHTML = '<span>👆</span><span>Toque em <b>+ Aula</b> para adicionar, ou numa aula para mudar a duração, registrar eventos, mover ou remover.</span>';
    });
    document.addEventListener('click', function (e) {
      var it = e.target.closest && e.target.closest('.win-sm-item[data-sm]');
      if (it) openSlot(+it.getAttribute('data-sm'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var it = e.target.closest && e.target.closest('.win-sm-item[data-sm]');
      if (it) openSlot(+it.getAttribute('data-sm'));
    });
  }

  window.WIN_SM = { openAdd: openAdd, add: add, dur: dur, extra: extra, move: move, remove: remove };

  function init() {
    try { setupDrawer(); } catch (e) { console.warn('[win-mobile] menu', e); }
    try { setupSchedule(); } catch (e) { console.warn('[win-mobile] grade', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
