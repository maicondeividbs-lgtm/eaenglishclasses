/* ═══════════════════════════════════════════════════════════════
   WIN — movimento dos painéis (aluno, professor, coordenação)
   Par de win-motion.css. Não altera nenhuma lógica dos painéis:
   só observa o que já acontece (troca de seção, listas que chegam,
   contadores que mudam) e anima a passagem de um estado ao outro.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  function raf(fn) { return window.requestAnimationFrame(fn); }
  function now() { return Date.now(); }
  function visible(el) { return !!(el && el.offsetParent !== null); }

  // ── 1) PÍLULA DESLIZANTE DO MENU ────────────────────────────
  var nav, glide, glideStyled = false, glideShown = false, glideQueued = false;

  function activeInNav() {
    if (!nav) return null;
    var list = nav.querySelectorAll('.sb-link.active');
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }

  // Copia o visual do item ativo (cada painel tem sua cor) para a pílula
  function styleGlide(from) {
    var cs = getComputedStyle(from);
    glide.style.backgroundColor = cs.backgroundColor;
    glide.style.backgroundImage = cs.backgroundImage;
    glide.style.boxShadow = cs.boxShadow;
    glide.style.borderRadius = cs.borderRadius;
    glideStyled = true;
    nav.classList.add('win-glide-on');
  }

  function placeGlide(animate) {
    glideQueued = false;
    var a = activeInNav();
    if (!a) { glide.classList.remove('on'); glideShown = false; return; }
    if (!glideStyled) styleGlide(a);
    var nr = nav.getBoundingClientRect(), ar = a.getBoundingClientRect();
    var x = ar.left - nr.left + nav.scrollLeft;
    var y = ar.top - nr.top + nav.scrollTop;
    var jump = !animate || !glideShown;
    if (jump) glide.style.transition = 'none';
    glide.style.width = ar.width + 'px';
    glide.style.height = ar.height + 'px';
    glide.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (jump) { void glide.offsetWidth; glide.style.transition = ''; }
    glide.classList.add('on');
    glideShown = true;
  }
  function queueGlide() {
    if (glideQueued) return;
    glideQueued = true;
    raf(function () { placeGlide(true); });
  }

  function setupGlide() {
    nav = document.querySelector('.sb .sb-nav');
    if (!nav) return;
    glide = document.createElement('div');
    glide.className = 'win-glide';
    glide.setAttribute('aria-hidden', 'true');
    nav.insertBefore(glide, nav.firstChild);
    new MutationObserver(queueGlide).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (window.ResizeObserver) new ResizeObserver(function () { raf(function () { placeGlide(false); }); }).observe(nav);
    window.addEventListener('resize', function () { raf(function () { placeGlide(false); }); });
    placeGlide(false);
  }

  // ── 2) LINHA DAS ABAS DE GRUPO ──────────────────────────────
  var lastTab = null; // { left, width, t }

  function inkFor(bar) {
    var ink = bar.querySelector(':scope > .win-ink');
    if (!ink) {
      ink = document.createElement('span');
      ink.className = 'win-ink';
      ink.setAttribute('aria-hidden', 'true');
      bar.appendChild(ink);
      bar.classList.add('win-ink-on');
    }
    return ink;
  }
  function setInk(ink, left, width, animate) {
    ink.classList.toggle('go', !!animate);
    ink.style.transform = 'translateX(' + left + 'px)';
    ink.style.width = width + 'px';
  }
  function placeInk(section) {
    var bar = section && section.querySelector(':scope > .win-tabs');
    if (!bar) return;
    var tab = bar.querySelector('.win-tab.active');
    if (!tab) return;
    var ink = inkFor(bar);
    if (lastTab && now() - lastTab.t < 1200) {
      setInk(ink, lastTab.left, lastTab.width, false);
      void ink.offsetWidth;
      setInk(ink, tab.offsetLeft, tab.offsetWidth, true);
    } else {
      setInk(ink, tab.offsetLeft, tab.offsetWidth, false);
    }
    lastTab = null;
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.win-tab') : null;
    if (!t) return;
    var cur = t.parentNode && t.parentNode.querySelector('.win-tab.active');
    if (cur) lastTab = { left: cur.offsetLeft, width: cur.offsetWidth, t: now() };
  }, true);

  // ── 3) CASCATA DE ITENS ─────────────────────────────────────
  var ITEM = '.list-item, .sent-card, .wr-card, .vocab-card, .pron-card, .prof-wr-card, .student-card, ' +
             '.today-item, .class-item, .voc-word-card, .doc-student-card, .stu-row, .hw-card, .task-card, .fb-card';
  var armed = {}; // id da seção → até quando anima

  function arm(section, ms) { if (section && section.id) armed[section.id] = now() + (ms || 1600); }
  function isArmed(section) { return section && armed[section.id] && armed[section.id] > now(); }

  function cascade(nodes) {
    var i = 0;
    nodes.forEach(function (el) {
      if (i > 10 || el.classList.contains('win-in')) return;
      el.style.setProperty('--win-i', i++);
      el.classList.add('win-in');
      el.addEventListener('animationend', function done() {
        el.classList.remove('win-in');
        el.style.removeProperty('--win-i');
        el.removeEventListener('animationend', done);
      });
    });
  }

  function onAdded(muts) {
    var batch = [];
    for (var m = 0; m < muts.length; m++) {
      var added = muts[m].addedNodes;
      for (var n = 0; n < added.length; n++) {
        var el = added[n];
        if (el.nodeType !== 1) continue;
        var sec = el.closest ? el.closest('.section') : null;
        if (!isArmed(sec)) continue;
        var parentIsList = el.parentNode && el.parentNode.id && /list$/i.test(el.parentNode.id);
        if (el.matches(ITEM) || parentIsList) batch.push(el);
        else if (el.querySelectorAll) {
          var inner = el.querySelectorAll(ITEM);
          for (var k = 0; k < inner.length && k < 12; k++) batch.push(inner[k]);
        }
      }
    }
    if (batch.length) cascade(batch);
  }

  // ── 4) CONTADOR QUE PULA ────────────────────────────────────
  function watchCounts(root) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target;
        if (!el || el.nodeType !== 1 || !el.classList.contains('win-count')) return;
        var n = parseInt(el.textContent, 10) || 0;
        var prev = el.dataset.winPrev === undefined ? null : parseInt(el.dataset.winPrev, 10);
        el.dataset.winPrev = n;
        if (prev !== null && n > prev) {
          el.classList.remove('win-bump'); void el.offsetWidth; el.classList.add('win-bump');
          el.addEventListener('animationend', function done() { el.classList.remove('win-bump'); el.removeEventListener('animationend', done); });
        }
      });
    }).observe(root, { subtree: true, childList: true });
  }

  // ── INÍCIO ──────────────────────────────────────────────────
  function setup() {
    try { setupGlide(); } catch (e) { console.warn('[win-motion] menu:', e); }

    var sections = document.querySelectorAll('.section');
    var lastActive = document.querySelector('.section.active');
    arm(lastActive, 3000); // dados da primeira tela chegam depois do login
    var secObs = new MutationObserver(function () {
      var a = document.querySelector('.section.active');
      if (a && a !== lastActive) {
        lastActive = a;
        arm(a);
        raf(function () { placeInk(a); });
      }
    });
    sections.forEach(function (s) { secObs.observe(s, { attributes: true, attributeFilter: ['class'] }); });

    var content = document.querySelector('.content') || document.querySelector('.main') || document.body;
    new MutationObserver(onAdded).observe(content, { subtree: true, childList: true });

    var sb = document.querySelector('.sb');
    if (sb) watchCounts(sb);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
