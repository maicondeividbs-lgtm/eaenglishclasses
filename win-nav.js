/* ═══════════════════════════════════════════════════════════════
   WIN — navegação do menu lateral (compartilhado pelos 3 dashboards)

   1) GRUPOS: itens do mesmo assunto viram UM item no menu, com abas
      no topo da seção. Os botões originais continuam no DOM (ocultos),
      então todo atalho existente — notificações, cards, "ir para" —
      segue funcionando sem mudança: clicar no botão oculto troca a
      seção normalmente e o item do grupo fica marcado como ativo.
   2) REDIRECIONAMENTOS: uma seção que passou a morar dentro de outra
      (ex.: "Minha Grade" do aluno, agora na Visão Geral).
   3) CONTADORES: número ao lado do item no menu e nas abas.
      O aluno vê itens não abertos; ao abrir a seção, eles são
      marcados como vistos (ver menu_contadores.sql).

   Uso:  WIN_NAV.init({ groups, redirects, counters, seen, labels })
   Nada aqui altera a lógica dos dashboards: se este arquivo falhar,
   o menu antigo continua funcionando.
   ═══════════════════════════════════════════════════════════════ */

var WIN_NAV = (function () {
  'use strict';

  var cfg = { groups: [], redirects: {}, counters: null, seen: {} };
  var counts = {};
  var bars = [];           // { el: seção, bar: abas, head: section-head? }
  var lastSec = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function btnFor(sec) { return document.querySelector('.sb-link[data-section="' + sec + '"]'); }
  function activeSection() {
    var a = document.querySelector('.section.active');
    return a ? a.id.replace(/^sec-/, '') : null;
  }
  function groupOf(sec) {
    for (var i = 0; i < cfg.groups.length; i++) {
      if (cfg.groups[i].members.indexOf(sec) >= 0) return cfg.groups[i];
    }
    return null;
  }
  function user() {
    try { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
    catch (e) { return null; }
  }
  function go(sec) { var b = btnFor(sec); if (b) b.click(); }

  // ── 1) GRUPOS ──────────────────────────────────────────────
  function buildBar(g, sec) {
    var bar = document.createElement('div');
    bar.className = 'win-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', g.label);
    g.members.forEach(function (m) {
      var t = document.createElement('button');
      var on = (m === sec);
      t.type = 'button';
      t.className = 'win-tab' + (on ? ' active' : '');
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.innerHTML = '<span>' + esc(g.tabs[m] || m) + '</span>' +
        '<i class="win-count zero" data-win-count="' + esc(m) + '"></i>';
      t.addEventListener('click', function () { if (!on) go(m); });
      bar.appendChild(t);
    });
    return bar;
  }

  // Coloca (ou recoloca) as abas no topo da seção. Algumas seções
  // reescrevem o próprio HTML ao carregar — aí as abas voltam sozinhas.
  function placeBar(o) {
    if (o.bar.parentNode === o.el) return;
    var head = null;
    for (var i = 0; i < o.el.children.length; i++) {
      if (o.el.children[i].classList.contains('section-head')) { head = o.el.children[i]; break; }
    }
    if (head) head.insertAdjacentElement('afterend', o.bar);
    else o.el.insertBefore(o.bar, o.el.firstChild);
  }

  function setupGroups() {
    cfg.groups.forEach(function (g) {
      g.tabs = g.tabs || {};
      g.members.forEach(function (sec, i) {
        var b = btnFor(sec);
        if (b && i > 0) { b.classList.add('win-merged'); b.setAttribute('tabindex', '-1'); b.setAttribute('aria-hidden', 'true'); }
        var el = document.getElementById('sec-' + sec);
        if (!el) return;
        var o = { el: el, bar: buildBar(g, sec) };
        bars.push(o);
        placeBar(o);
        new MutationObserver(function () { placeBar(o); }).observe(el, { childList: true });
      });
    });
  }

  // Mantém o item do grupo marcado e o título da barra superior coerente
  function syncActive() {
    var cur = activeSection();
    var g = cur ? groupOf(cur) : null;
    if (!g) return;
    var p = btnFor(g.members[0]);
    if (p && !p.classList.contains('active')) p.classList.add('active');
    var tt = document.getElementById('topbarTitle');
    if (tt && tt.textContent !== g.label) tt.textContent = g.label;
  }

  // ── 2) REDIRECIONAMENTOS ───────────────────────────────────
  function setupRedirects() {
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.sb-link[data-section]') : null;
      if (!b) return;
      var r = cfg.redirects[b.dataset.section];
      if (!r) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      go(r.to);
      if (r.scrollTo) {
        setTimeout(function () {
          var el = document.getElementById(r.scrollTo);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    }, true);
  }

  // ── 3) CONTADORES ──────────────────────────────────────────
  function setBadge(el, n) {
    n = Math.max(0, n | 0);
    el.textContent = n > 99 ? '99+' : (n ? String(n) : '');
    el.classList.toggle('zero', !n);
    if (n) el.title = n + (n === 1 ? ' item não aberto' : ' itens não abertos');
    else el.removeAttribute('title');
  }
  function sideBadge(sec, n) {
    var b = btnFor(sec);
    if (!b) return;
    var i = null;
    for (var k = 0; k < b.children.length; k++) {
      if (b.children[k].classList.contains('win-count')) { i = b.children[k]; break; }
    }
    if (!i) {
      i = document.createElement('i');
      i.className = 'win-count zero';
      var tip = b.querySelector(':scope > .tip');
      if (tip) b.insertBefore(i, tip); else b.appendChild(i);
    }
    setBadge(i, n);
  }
  function paint() {
    document.querySelectorAll('[data-win-count]').forEach(function (el) {
      setBadge(el, counts[el.getAttribute('data-win-count')] || 0);
    });
    var inGroup = {};
    cfg.groups.forEach(function (g) {
      var total = 0;
      g.members.forEach(function (m) { total += (counts[m] || 0); inGroup[m] = 1; });
      sideBadge(g.members[0], total);
    });
    Object.keys(counts).forEach(function (sec) { if (!inGroup[sec]) sideBadge(sec, counts[sec]); });
  }

  var refreshing = false;
  async function refresh() {
    var u = user();
    if (!cfg.counters || !u || refreshing) return;
    refreshing = true;
    try {
      var c = await cfg.counters(u);
      if (c && typeof c === 'object') { counts = c; paint(); }
    } catch (e) { /* contador é opcional: nunca quebra o painel */ }
    refreshing = false;
  }

  async function markSeen(sec) {
    var kind = cfg.seen[sec];
    if (!kind || !(counts[sec] > 0) || typeof winMarkSeen !== 'function') return;
    counts[sec] = 0;
    paint();
    await winMarkSeen(kind);
    setTimeout(refresh, 1500);
  }

  function onSection(sec) {
    syncActive();
    markSeen(sec);
  }

  // ── INICIALIZAÇÃO ──────────────────────────────────────────
  function setup() {
    try {
      setupGroups();
      setupRedirects();
    } catch (e) { console.error('[WIN_NAV] grupos:', e); }

    var sb = document.querySelector('.sb');
    if (sb) new MutationObserver(syncActive).observe(sb, { subtree: true, attributes: true, attributeFilter: ['class'] });

    lastSec = activeSection();
    var mo = new MutationObserver(function () {
      var s = activeSection();
      if (s && s !== lastSec) { lastSec = s; onSection(s); }
    });
    document.querySelectorAll('.section').forEach(function (s) {
      mo.observe(s, { attributes: true, attributeFilter: ['class'] });
    });

    // Espera o login terminar antes da primeira contagem
    var tries = 0;
    (function wait() {
      if (user()) { refresh().then(function () { var s = activeSection(); if (s) markSeen(s); }); return; }
      if (++tries < 120) setTimeout(wait, 500);
    })();

    setInterval(refresh, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  function init(c) {
    cfg.groups = (c && c.groups) || [];
    cfg.redirects = (c && c.redirects) || {};
    cfg.counters = (c && c.counters) || null;
    cfg.seen = (c && c.seen) || {};
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
  }

  return { init: init, refresh: refresh, go: go };
})();
