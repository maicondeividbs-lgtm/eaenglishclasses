/* EA English Classes — feedback de interação do app (som + vibração + toque) */
(function () {
  'use strict';

  // App/mobile apenas. No DESKTOP (navegador largo) o app-fx fica inerte:
  // sem som, sem botão de áudio, sem feedback de "press" — o site continua site.
  var mq = window.matchMedia ? window.matchMedia.bind(window) : null;
  var isApp = (mq && (mq('(display-mode: standalone)').matches || mq('(max-width: 900px)').matches)) || window.navigator.standalone === true;
  if (!isApp) {
    window.eaFx = { tap: function () {}, nav: function () {}, toggle: function () {}, success: function () {}, error: function () {}, haptic: function () {} };
    return;
  }

  function isMuted() { try { return localStorage.getItem('ea_sound') === 'off'; } catch (e) { return false; } }
  function setMuted(v) { try { localStorage.setItem('ea_sound', v ? 'off' : 'on'); } catch (e) {} }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function audio() {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!window._eaAudio) { try { window._eaAudio = new C(); } catch (e) { return null; } }
    if (window._eaAudio.state === 'suspended') { try { window._eaAudio.resume(); } catch (e) {} }
    return window._eaAudio;
  }

  // Toca uma nota curta. freq Hz, dur s, type, peak (volume 0..1)
  function note(freq, start, dur, peak, type) {
    var c = audio(); if (!c) return;
    try {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      var t = c.currentTime + (start || 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak || 0.05, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function haptic(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) {} } }

  var EaFx = {
    haptic: haptic,
    tap: function () { if (!isMuted()) note(430, 0, 0.06, 0.045, 'triangle'); haptic(7); },
    nav: function () { if (!isMuted()) note(560, 0, 0.07, 0.05, 'sine'); haptic(10); },
    toggle: function () { if (!isMuted()) note(380, 0, 0.05, 0.05, 'square'); haptic(12); },
    success: function () { if (!isMuted()) { note(660, 0, 0.10, 0.06, 'sine'); note(990, 0.09, 0.14, 0.05, 'sine'); } haptic(18); },
    error: function () { if (!isMuted()) { note(300, 0, 0.12, 0.06, 'sawtooth'); note(220, 0.1, 0.16, 0.05, 'sawtooth'); } haptic([20, 40, 20]); }
  };
  window.eaFx = EaFx;

  // Destrava o áudio no primeiro gesto
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function un() { audio(); document.removeEventListener(ev, un); }, { once: true, passive: true });
  });

  // Feedback ao tocar em elementos interativos (delegação)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button, a[href], .sb-link, [role="button"], [data-section], .tap-fx');
    if (!el) return;
    if (el.closest('[data-nofx]') || el.id === 'eaSoundToggle') return;
    var isNav = !!(el.closest('.sb-nav') || el.hasAttribute('data-section') || el.classList.contains('sb-link'));
    if (isNav) EaFx.nav(); else EaFx.tap();
  }, true);

  // Som de sucesso/erro automático quando aparece um toast (cobre salvar/enviar/erros)
  if (typeof window.showToast === 'function' && !window._eaToastWrapped) {
    var _orig = window.showToast;
    window.showToast = function (msg, type) {
      try { (type === 'error' ? EaFx.error : EaFx.success)(); } catch (e) {}
      return _orig.apply(this, arguments);
    };
    window._eaToastWrapped = true;
  }

  // Estilos: feedback de "press" + botão de som
  var st = document.createElement('style');
  st.id = 'eaFxStyle';
  st.textContent =
    (reduce ? '' :
      'button,.sb-link,[role="button"],.app-install-btn{transition:transform .09s ease}' +
      'button:active,.sb-link:active,[role="button"]:active,.app-install-btn:active{transform:scale(.97)}') +
    '#eaSoundToggle{position:fixed;left:16px;bottom:16px;z-index:99990;width:44px;height:44px;border-radius:50%;' +
    'border:1px solid rgba(25,36,78,.12);background:#fff;color:#19244e;box-shadow:0 8px 24px rgba(25,36,78,.18);' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}' +
    '#eaSoundToggle:active{transform:scale(.92)}' +
    '#eaSoundToggle svg{width:20px;height:20px}';
  (document.head || document.documentElement).appendChild(st);

  // Botão flutuante de som (liga/desliga) — só nas telas do app
  function icon(on) {
    return on
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  }
  function mountToggle() {
    if (document.getElementById('eaSoundToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'eaSoundToggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Ligar ou desligar o som do app');
    btn.setAttribute('data-nofx', '');
    btn.innerHTML = icon(!isMuted());
    btn.addEventListener('click', function () {
      var nowMuted = !isMuted();
      setMuted(nowMuted);
      btn.innerHTML = icon(!nowMuted);
      if (!nowMuted) EaFx.toggle(); // toca só ao LIGAR
      else haptic(12);
    });
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle);
  else mountToggle();
})();
