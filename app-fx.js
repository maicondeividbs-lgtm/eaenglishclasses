/* EA English Classes — feedback de interação do app (som + vibração + toque) */
(function () {
  'use strict';

  // App/mobile apenas. No DESKTOP (navegador largo) o app-fx fica inerte:
  // sem som, sem feedback de "press" — o site continua site.
  var mq = window.matchMedia ? window.matchMedia.bind(window) : null;
  var isApp = (mq && (mq('(display-mode: standalone)').matches || mq('(max-width: 900px)').matches)) || window.navigator.standalone === true;
  if (!isApp) {
    var noop = function () {};
    window.eaFx = { active: false, tap: noop, nav: noop, toggle: noop, success: noop, error: noop, notify: noop, open: noop, close: noop, dismiss: noop, pop: noop, haptic: noop };
    window.eaSound = { isOn: function () { return true; }, set: noop };
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

  // Reverb curtinho e sutil (impulso sintético) — dá "ar" e qualidade às notas.
  function reverb(c) {
    if (c._eaVerb !== undefined) return c._eaVerb;
    try {
      var len = Math.floor(c.sampleRate * 0.5), ir = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      var conv = c.createConvolver(); conv.buffer = ir;
      var wet = c.createGain(); wet.gain.value = 0.11;
      conv.connect(wet);
      c._eaVerb = { conv: conv, wet: wet };
    } catch (e) { c._eaVerb = null; }
    return c._eaVerb;
  }

  // Barramento master com leve compressão (cola/sem estouros) + envio ao reverb.
  function bus(c) {
    if (c._eaBus) return c._eaBus;
    var master = c.createGain(); master.gain.value = 0.9;
    var comp = c.createDynamicsCompressor();
    try { comp.threshold.value = -22; comp.knee.value = 22; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.18; } catch (e) {}
    master.connect(comp); comp.connect(c.destination);
    var v = reverb(c); if (v) { master.connect(v.conv); v.wet.connect(c.destination); }
    c._eaBus = master; return master;
  }

  // Uma voz com envelope ADSR suave. glideTo (Hz) = deslize de pitch.
  // rich=true acrescenta uma 2a oscilacao levemente desafinada (mais quente).
  function voice(freq, start, dur, peak, type, glideTo, rich) {
    var c = audio(); if (!c) return;
    try {
      var t = c.currentTime + (start || 0);
      function osc(detCents, gainMul) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (detCents) o.detune.setValueAtTime(detCents, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
        var p = (peak || 0.05) * gainMul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(p, t + 0.012);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, p * 0.55), t + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(bus(c));
        o.start(t); o.stop(t + dur + 0.05);
      }
      osc(0, 1);
      if (rich) osc(-7, 0.55);
    } catch (e) {}
  }
  function chord(freqs, start, dur, peak, type) { for (var i = 0; i < freqs.length; i++) voice(freqs[i], start, dur, peak * (i === 0 ? 1 : 0.7), type, null, true); }
  function haptic(p) { if (navigator.vibrate) { try { navigator.vibrate(p || 8); } catch (e) {} } }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var EaFx = {
    active: true,
    haptic: haptic,
    // Toque: nota curta arredondada e humanizada + brilho de oitava
    tap: function () { if (!isMuted()) { var f = rnd(1015, 1075); voice(f, 0, 0.06, 0.030, 'sine'); voice(f * 2, 0, 0.045, 0.008, 'sine'); } haptic(6); },
    // Pop: blip curtinho ascendente, para micro-acoes
    pop: function () { if (!isMuted()) { var f = rnd(620, 690); voice(f, 0, 0.05, 0.030, 'sine', f * 1.28); } haptic(5); },
    // Navegacao: dois toques claros subindo (E5 -> B5) com brilho
    nav: function () { if (!isMuted()) { voice(659.3, 0, 0.07, 0.034, 'sine'); voice(1318.6, 0, 0.05, 0.009, 'sine'); voice(987.8, 0.052, 0.10, 0.026, 'sine', null, true); } haptic(9); },
    // Abrir painel/menu: sopro curto subindo
    open: function () { if (!isMuted()) voice(523.3, 0, 0.11, 0.024, 'sine', 784.0, true); haptic(6); },
    // Fechar: descida curtinha
    close: function () { if (!isMuted()) voice(659.3, 0, 0.09, 0.022, 'sine', 440.0); haptic(5); },
    // Dispensar/marcar lida: "swish" gentil para baixo + tiquezinho
    dismiss: function () { if (!isMuted()) { voice(880, 0, 0.085, 0.026, 'sine', 466.2); voice(rnd(300, 340), 0.03, 0.10, 0.016, 'sine'); } haptic([6, 18]); },
    // Liga/desliga: nota quente (A5) com a 5a
    toggle: function () { if (!isMuted()) chord([880, 1318.5], 0, 0.10, 0.028, 'sine'); haptic(10); },
    // Sucesso: arpejo maior alegre (C5 E5 G5 C6) com brilho no topo
    success: function () { if (!isMuted()) { voice(523.3, 0, 0.12, 0.044, 'sine'); voice(659.3, 0.085, 0.12, 0.044, 'sine'); voice(784.0, 0.17, 0.14, 0.040, 'sine'); voice(1046.5, 0.255, 0.24, 0.034, 'triangle', null, true); } haptic(16); },
    // Erro: descida suave de duas notas, sem aspereza
    error: function () { if (!isMuted()) { voice(415.3, 0, 0.14, 0.05, 'sine', 392.0); voice(311.1, 0.12, 0.20, 0.044, 'sine'); } haptic([16, 40, 16]); },
    // Notificacao (sino): "ding-dong" cristalino e gentil com cauda
    notify: function () { if (!isMuted()) { voice(1318.5, 0, 0.18, 0.05, 'sine'); voice(1976.0, 0, 0.14, 0.016, 'sine'); voice(987.8, 0.17, 0.55, 0.044, 'sine', null, true); } haptic([12, 30, 12]); }
  };
  window.eaFx = EaFx;

  // Destrava o audio no primeiro gesto do usuario (exigencia de mobile/iOS)
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function un() { audio(); document.removeEventListener(ev, un); }, { once: true, passive: true });
  });

  // Feedback ao tocar em elementos interativos (delegacao)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button, a[href], .sb-link, [role="button"], [data-section], .tap-fx');
    if (!el) return;
    if (el.closest('[data-nofx]') || el.hasAttribute('data-nofx')) return;
    var isNav = !!(el.closest('.sb-nav') || el.hasAttribute('data-section') || el.classList.contains('sb-link'));
    if (isNav) EaFx.nav(); else EaFx.tap();
  }, true);

  // Som de sucesso/erro automatico quando aparece um toast
  if (typeof window.showToast === 'function' && !window._eaToastWrapped) {
    var _orig = window.showToast;
    window.showToast = function (msg, type) {
      try { (type === 'error' ? EaFx.error : EaFx.success)(); } catch (e) {}
      return _orig.apply(this, arguments);
    };
    window._eaToastWrapped = true;
  }

  // Estilo de "press" (escala sutil ao tocar)
  if (!reduce) {
    var st = document.createElement('style');
    st.id = 'eaFxStyle';
    st.textContent =
      'button,.sb-link,[role="button"],.app-install-btn,.notif-item,.notif-bell-btn,.notif-dismiss{transition:transform .09s ease}' +
      'button:active,.sb-link:active,[role="button"]:active,.app-install-btn:active,.notif-bell-btn:active,.notif-dismiss:active{transform:scale(.96)}';
    (document.head || document.documentElement).appendChild(st);
  }

  // Helper publico para o controle de som da aba "Meu Perfil"
  window.eaSound = {
    isOn: function () { return !isMuted(); },
    set: function (on) { setMuted(!on); if (on) { try { EaFx.toggle(); } catch (e) {} } else { haptic(12); } }
  };
})();
