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
    // Toque delicado (C6) — discreto e arredondado
    tap: function () { if (!isMuted()) note(1046.5, 0, 0.055, 0.03, 'sine'); haptic(6); },
    // Navegação: dois toques suaves subindo (E5 → B5)
    nav: function () { if (!isMuted()) { note(659.3, 0, 0.06, 0.04, 'sine'); note(987.8, 0.045, 0.08, 0.03, 'sine'); } haptic(9); },
    // Liga/desliga: nota única quente (A5)
    toggle: function () { if (!isMuted()) note(880, 0, 0.07, 0.035, 'sine'); haptic(10); },
    // Sucesso: arpejo maior alegre (C5 → E5 → G5)
    success: function () { if (!isMuted()) { note(523.3, 0, 0.10, 0.045, 'sine'); note(659.3, 0.085, 0.10, 0.045, 'sine'); note(784.0, 0.17, 0.17, 0.04, 'sine'); } haptic(16); },
    // Erro: descida suave (Ab4 → Eb4), sem aspereza
    error: function () { if (!isMuted()) { note(415.3, 0, 0.12, 0.045, 'sine'); note(311.1, 0.11, 0.18, 0.04, 'sine'); } haptic([16, 36, 16]); }
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
    if (el.closest('[data-nofx]') || el.hasAttribute('data-nofx')) return;
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

  // Estilos: apenas o feedback de "press" (sem botão flutuante — o controle
  // de som agora fica na aba "Meu Perfil").
  if (!reduce) {
    var st = document.createElement('style');
    st.id = 'eaFxStyle';
    st.textContent =
      'button,.sb-link,[role="button"],.app-install-btn{transition:transform .09s ease}' +
      'button:active,.sb-link:active,[role="button"]:active,.app-install-btn:active{transform:scale(.97)}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Helper público para o controle de som da aba "Meu Perfil"
  window.eaSound = {
    isOn: function () { return !isMuted(); },
    set: function (on) { setMuted(!on); if (on) { try { EaFx.toggle(); } catch (e) {} } else { haptic(12); } }
  };
})();
