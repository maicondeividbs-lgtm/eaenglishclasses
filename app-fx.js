/* EA English Classes — feedback de interação do app (som leve + vibração + toque) */
(function () {
  'use strict';

  // App/mobile apenas. No DESKTOP (navegador largo) fica inerte: sem som.
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

  // Master leve e limpo — sem reverb nem compressor pesado.
  function master(c) {
    if (c._eaMaster) return c._eaMaster;
    var g = c.createGain(); g.gain.value = 0.85; g.connect(c.destination);
    c._eaMaster = g; return g;
  }

  // ── Amostra de clique (WAV enviado), decodificada uma vez ──
  var CLICK_B64 = "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yf/O/9b/4//w//v/BAAIAAgABAD+//3//f8CAAsAFQAfACYAKQAnAB8AEQD+/+f/0//E/73/vf/E/9P/5//+/xMAJgAxADcANAAsAB8AEgAFAPr/8//u/+7/7v/x//P/8//w/+r/5v/i/+L/5P/s//f/BQAVACUAMAA3ADYALwAgAA4A+v/n/9j/zP/I/8v/0//i//D//v8JABIAFgAYABUAEQAMAAkACAAHAAkACwAMAAkABQD9//T/6v/g/9r/1v/Z/9//7P/6/wkAGQAlACwALAAmAB0ADwABAPT/6f/i/+D/4v/n/+3/9P/7/wAABAAEAAIAAQAAAAEAAgAHAAsAEQATABMAEgAMAAQA+v/w/+b/3//c/93/5P/t//j/BQARABgAHQAdABkAEgABAOT/zP/O/+7/GQAzADYAMQAxACIA/f/T/73/vv/G/8z/2v/2/xMAIwAjACAAHwASAPj/3f/V/9r/4//q//T/DAAmADQANAAwACkAGwACAOr/3P/Z/9j/1v/c/+3/AgAOAA8ADgAOAAgA+v/s/+b/6f/u//b/AgAWACcALwApAB8AFQAEAOz/0//C/73/v//J/9r/9v8PACUAMQA6AD0ANwAmABEA/v/x/+f/4v/g/+b/7v/3//v/AAAAAPv/8f/p/+T/5v/q//D/+/8LABwAKQAwADEALAAfAAwA+v/p/9r/0P/O/9D/3f/t//3/CwAVABwAHQAZABEACAD+//b/8P/u//P/+P/+/wIABQAHAAUAAAD6//P/7v/t/+7/9P/+/wgAEQAYAB0AHQAZAA4AAgD0/+n/4P/a/9r/4P/p//T/AAAMABUAGQAZABUADwAJAAIA+//3//b/9//4//v//f/+//7//f/4//b/8//x//P/9v/7/wIABwALAA4ADwAPAAwACAABAPr/8//s/+n/6f/s//D/9v/9/wQACwAPABEAEQAPAAsABwABAP3/8f/a/8j/0P/0/yIAPgBCADoALAAPAOn/yP+9/8H/y//Y//D/DwAlACkAIwAdAA8A+v/i/9n/3P/m/+7//f8TACUAKgAmAB0AEwABAOz/3P/Z/9//5v/w/wEAEwAdAB0AGQARAAIA8P/f/9j/2f/g/+r/+P8OAB8AJwApACUAGwAJAPb/5v/c/9n/2f/f/+z//f8LABMAGAAZABMACQAAAPj/9v/0//b/+/8EAAwAEQASAA8ACAD7/+7/4//d/9r/3P/j/+7//v8MABgAHwAiAB8AGAAOAAQA/f/2//H/8f/0//r//f8AAAEAAAD7//b/8P/t/+3/7v/0//v/BQAOABUAGQAZABUADgAFAP3/9P/u/+r/6v/u//T/+v8AAAUABwAHAAQAAQD+//3/+v/7//7/AQAFAAgACQAJAAUAAAD7//b/8f/t/+7/8P/2//v/AgAIAAwADwAOAAsABwACAP3/+v/3//b/9//6//3//v8AAAAA/v/9//r/+P/3//f/+v/9/wEABQAJAAwADAALAAcAAgD9//j/9P/x//H/9P/3//r//v8BAAQABAAEAAIAAAD+//3//f/9//7/AQAEAAQABAAEAAIAAAD9//j/9//2//b/9//6//3/AQAEAAcABwAHAAUAAgD+//3/+v/4//r/+v/9//7/AQACAAIAAgABAAAA/v/7//r/+v/7//3//v8BAAIABAAEAAIAAQD+//v/+v/4//j/+v/7//7/AQACAAQABAAEAAIAAQD+//v/+v/4//j/+v/7//7/AAABAAIAAgACAAEA/v/9//3/+//9//3//v8AAAEAAgACAAEAAAD7//f/8f/x//f/AQALAA8ADwAPAA4ABwD9//b/8f/w//D/8P/z//r/AAACAAQABAAFAAQAAAD9//v//f/+//7/AQAEAAcACAAFAAQAAQD+//j/8//x//P/9P/2//r/AAAFAAgACQAJAAgABwABAP3/+P/3//f/9v/4//v//v8BAAIAAgAEAAIAAAD7//r/+P/6//v//v8BAAQABwAHAAcABQABAPv/9//0//P/8//0//f//f8CAAcACwAMAAwACQAHAAEA/f/4//b/8//z//T/9//6//7/AAABAAIAAgACAAEAAQAAAAAAAQACAAQABAAEAAIAAQAAAPv/+P/0//P/8f/z//T/+P/9/wEABwAJAAwADAALAAgABAABAP7/+v/4//f/9//4//j/+v/7//3//f/9//7//v/+/wAAAAABAAQABQAFAAUABAACAAEA/v/7//j/9//2//b/9//6//v//v8BAAQABQAFAAUABAACAAEAAAD+//3/+//7//v/+//7//v//f/9//3//f/9//7/AAABAAEAAgACAAIAAgACAAEAAAD+//v/+//6//r/+v/6//3//f/+/wAAAAABAAIAAgACAAEAAQAAAAAA/v/+//7//f/9//v/+//7//v//f/9//7//v8AAAAAAAAAAAAAAAAAAAAAAQAAAAAA/v/+//3//f/9//v/+//9//3//v/+/wAAAAABAAEAAAAAAPv/9//2//v/BAALAA4ADgALAAUA/f/2//H/8P/x//P/9//9/wIABQAFAAQABAAAAP3/+v/7//3//v8BAAQABwAHAAUAAgABAP3/+P/0//T/9v/4//v/AAAEAAcABwAFAAQAAQD9//r/9//4//r/+//+/wIABQAFAAUABAABAP3/+v/3//b/9//4//v//v8CAAUABQAHAAUAAgAAAP3/+//6//r/+//9/wAAAQACAAIAAQAAAP3/+v/4//f/9//4//v/AAACAAUABwAHAAcABQABAP7/+//6//j/+P/7//3//v8AAAEAAQAAAAAA/v/9//v/+//7//3/AAABAAIABAAFAAQAAQAAAP3/+//6//j/+P/6//v//v8BAAEAAgACAAIAAQAAAP7//f/9//3//f/+/wAAAAABAAEAAAD+//3/+//7//v/+//9//7/AAABAAIAAgAEAAIAAQAAAP3//f/7//v/+//7//3//v/+/wAAAAAAAAAAAAD+//7//v/+//7/AAAAAAEAAQABAAAAAAD+//3/+//7//v/+//9//3//v8AAAAAAAABAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/9//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//f/9//3//v/+//7//v8AAAAAAAAAAAAA/v8AAP7//v/+//7//v/9//3//f/+/wAAAQABAAEAAAAAAP7//f/7//3//f/9//7//v8AAAAAAAAAAAAAAAD+//7//f/+//7//v8AAAAAAAABAAAAAAAAAP7//v/9//3//f/9//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/9//3//v/+//7/AAAAAAAAAQABAAAAAAAAAP7//v/+//7//v/9//7//v/+//7//v/+/wAA/v8AAP7//v/+//7//v/+//7/AAD+/wAAAAD+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//3//f/9//3//f/9//7//v8AAAAAAQABAAEAAQABAAAAAAD+//7//f/9//3//f/9//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAABAAAAAAD+//7//f/9//3//f/9//3//f/+/wAAAAAAAAEAAQABAAEAAAAAAP7//v/+//3//f/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAQABAAAAAAAAAAAA/v/+//3//f/9//3//f/9//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//3//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//3//f/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAD+//7//v/+/wAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//3//f/9//7/AAABAAIAAQABAAAA/v/9//v/+//9//3//v8AAAAAAAAAAAAAAAD+//3//f/+//7//v8AAAAAAQABAAAAAAAAAP7//f/9//3//f/+//7/AAAAAAAAAAAAAP7//v/9//3//f/9//3//v8AAAAAAQABAAEAAAD+//7//f/9//3//f/9//7//v8AAAAAAQAAAAAAAAD+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//f/9//3//f/9//7//v8AAAAAAQABAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/9//3//f/+//7/AAAAAAAAAAAAAAAAAAD+//7//f/9//3//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+/wAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7/AAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v8AAAAA/v/+//7//v/+//7//f/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAD+//7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7/AAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7/AAD+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7/AAD+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAD+//7//v/+//7//v8AAP7//v/+//7//v/+/wAA/v/+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7/AAD+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAP7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7/AAAAAP7//v/+//7//v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v8AAAAAAAAAAP7//v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+//7//v8AAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v8AAAAAAAD+//7//v8AAAAAAAAAAP7//v/+//7/AAAAAP7//v/+//7//v/+/wAA/v/+//7//v/+//7//v8AAAAAAAAAAP7/AAAAAAAAAAAAAAAA/v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAP7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7/AAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7//v/+/wAAAAAAAAAA/v/+//7//v8AAAAAAAAAAAAA/v/+//7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7/AAAAAAAAAAAAAAAAAAD+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAP7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAA/v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7/AAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAP7//v/+//7//v/+//7/AAAAAAAAAAAAAP7//v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+//7/AAD+/wAAAAAAAAAAAAAAAAAAAAD+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+//7//v8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//7//v/+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  function b64buf(b64) { var s = atob(b64), n = s.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function ensureSample() {
    var c = audio(); if (!c) return;
    if (window._eaSample || window._eaSampleLoading) return;
    window._eaSampleLoading = true;
    try {
      c.decodeAudioData(b64buf(CLICK_B64), function (buf) { window._eaSample = buf; window._eaSampleLoading = false; }, function () { window._eaSampleLoading = false; });
    } catch (e) { window._eaSampleLoading = false; }
  }
  // Toca o clique com leve variação de tom/volume (cada interação um tom)
  function playSample(rate, gain) {
    var c = audio(); if (!c) return false;
    if (!window._eaSample) { ensureSample(); return false; }
    try {
      var s = c.createBufferSource(); s.buffer = window._eaSample;
      s.playbackRate.value = rate || 1;
      var g = c.createGain(); g.gain.value = (gain == null ? 0.5 : gain);
      s.connect(g); g.connect(master(c));
      s.start(0);
      return true;
    } catch (e) { return false; }
  }

  // Tom sintético leve (uma senoide curta, sem camadas) — sucesso/erro/sino.
  function tone(freq, start, dur, peak, glideTo) {
    var c = audio(); if (!c) return;
    try {
      var t = c.currentTime + (start || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      var p = peak || 0.04;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master(c));
      o.start(t); o.stop(t + dur + 0.04);
    } catch (e) {}
  }

  function haptic(p) { if (navigator.vibrate) { try { navigator.vibrate(p || 8); } catch (e) {} } }
  // Reserva: clique sintético curtinho caso a amostra ainda não tenha decodificado.
  function clickFallback(rate) { tone(900 * (rate || 1), 0, 0.03, 0.025); }
  function click(rate, gain) { if (!playSample(rate, gain)) clickFallback(rate); }

  var EaFx = {
    active: true,
    haptic: haptic,
    tap:     function () { if (!isMuted()) click(1.00, 0.50); haptic(6); },
    pop:     function () { if (!isMuted()) click(1.18, 0.42); haptic(5); },
    nav:     function () { if (!isMuted()) click(1.07, 0.50); haptic(8); },
    open:    function () { if (!isMuted()) click(1.12, 0.46); haptic(6); },
    close:   function () { if (!isMuted()) click(0.90, 0.44); haptic(5); },
    dismiss: function () { if (!isMuted()) click(0.82, 0.40); haptic([6, 16]); },
    toggle:  function () { if (!isMuted()) click(1.00, 0.50); haptic(10); },
    // Sucesso: duas notas suaves subindo (leve, sem brilho exagerado)
    success: function () { if (!isMuted()) { tone(659.3, 0, 0.10, 0.035); tone(987.8, 0.09, 0.16, 0.030); } haptic(14); },
    // Erro: duas notas suaves descendo
    error:   function () { if (!isMuted()) { tone(440.0, 0, 0.12, 0.040, 392.0); tone(330.0, 0.10, 0.18, 0.034); } haptic([14, 34, 14]); },
    // Notificação: "ding" curto e cristalino
    notify:  function () { if (!isMuted()) { tone(1318.5, 0, 0.14, 0.040); tone(987.8, 0.13, 0.34, 0.030); } haptic([12, 28, 12]); }
  };
  window.eaFx = EaFx;

  // Destrava o áudio e pré-decodifica a amostra no primeiro gesto (mobile/iOS):
  // cria, resume e toca um buffer silencioso; tenta em vários eventos até "running".
  function unlockAudio() {
    var c = audio(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
    ensureSample();
    if (c.state === 'running') removeUnlock();
  }
  var _uEv = ['touchend', 'pointerdown', 'mousedown', 'click', 'keydown'];
  function removeUnlock() { _uEv.forEach(function (ev) { document.removeEventListener(ev, unlockAudio, true); }); }
  _uEv.forEach(function (ev) { document.addEventListener(ev, unlockAudio, true); });
  // Ao reabrir o app (PWA volta do segundo plano) o contexto pode suspender.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window._eaAudio && window._eaAudio.state === 'suspended') {
      try { window._eaAudio.resume(); } catch (e) {}
    }
  });

  // Feedback ao tocar em elementos interativos (delegação)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button, a[href], .sb-link, [role="button"], [data-section], .tap-fx');
    if (!el) return;
    if (el.closest('[data-nofx]') || el.hasAttribute('data-nofx')) return;
    var isNav = !!(el.closest('.sb-nav') || el.hasAttribute('data-section') || el.classList.contains('sb-link'));
    if (isNav) EaFx.nav(); else EaFx.tap();
  }, true);

  // Som de sucesso/erro quando aparece um toast (tolerante à ordem de carregamento)
  function wrapToast() {
    if (window._eaToastWrapped) return true;
    if (typeof window.showToast !== 'function') return false;
    var _orig = window.showToast;
    window.showToast = function (msg, type) {
      try { (type === 'error' ? EaFx.error : EaFx.success)(); } catch (e) {}
      return _orig.apply(this, arguments);
    };
    window._eaToastWrapped = true;
    return true;
  }
  if (!wrapToast()) {
    var _tw = 0, _twId = setInterval(function () { if (wrapToast() || ++_tw > 40) clearInterval(_twId); }, 150);
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

  // Controle de som da aba "Meu Perfil"
  window.eaSound = {
    isOn: function () { return !isMuted(); },
    set: function (on) { setMuted(!on); if (on) { try { EaFx.tap(); } catch (e) {} } else { haptic(12); } }
  };
})();
