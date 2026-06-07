/* EA English Classes — registro do PWA + instalação (Android/iPhone) */
(function () {
  if (!('serviceWorker' in navigator)) return;

  // Registra o service worker após o carregamento (não atrasa a página)
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.warn('SW falhou:', err);
    });
  });

  var deferred = null;
  var KEY = 'ea_pwa_dismissed';

  function dismissed() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function setDismissed() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }
  function smallScreen() {
    return window.matchMedia('(max-width: 900px)').matches || isIOS();
  }

  function makeBanner(html) {
    var b = document.createElement('div');
    b.id = 'eaInstall';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Instalar aplicativo');
    b.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:99999;max-width:340px;' +
      'background:#fff;color:#19244e;border:1px solid rgba(25,36,78,.12);' +
      'border-radius:16px;box-shadow:0 18px 50px rgba(25,36,78,.22);' +
      'padding:14px 14px 14px 16px;display:flex;gap:12px;align-items:center;' +
      'font-family:inherit;animation:eaSlideUp .35s cubic-bezier(.16,1,.3,1)';
    b.innerHTML = html;
    document.body.appendChild(b);
    if (!document.getElementById('eaInstallKf')) {
      var s = document.createElement('style');
      s.id = 'eaInstallKf';
      s.textContent = '@keyframes eaSlideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
        '#eaInstall .ea-i-icon{width:42px;height:42px;border-radius:11px;background:#19244e;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:800;font-size:20px;flex-shrink:0}' +
        '#eaInstall .ea-i-icon i{color:#f36b2e;font-style:normal}' +
        '#eaInstall .ea-i-title{font-weight:800;font-size:14px;line-height:1.2}' +
        '#eaInstall .ea-i-sub{font-size:12px;color:#6b7280;margin-top:2px;line-height:1.35}' +
        '#eaInstall .ea-i-btn{background:#f36b2e;color:#fff;border:none;border-radius:10px;' +
        'padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;min-height:40px;white-space:nowrap}' +
        '#eaInstall .ea-i-close{background:none;border:none;color:#9ca3af;font-size:18px;cursor:pointer;' +
        'padding:4px 8px;line-height:1;align-self:flex-start}';
      document.head.appendChild(s);
    }
    var close = b.querySelector('[data-ea-close]');
    if (close) close.addEventListener('click', function () { b.remove(); setDismissed(); });
    return b;
  }

  // Android / Chrome / Edge: prompt nativo
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (dismissed() || isStandalone() || !smallScreen()) return;
    var b = makeBanner(
      '<div class="ea-i-icon"><span>EA</span><i>.</i></div>' +
      '<div style="flex:1;min-width:0"><div class="ea-i-title">Instalar o app da EA</div>' +
      '<div class="ea-i-sub">Acesso rápido, em tela cheia, direto na sua tela inicial.</div></div>' +
      '<button class="ea-i-btn" data-ea-install type="button">Instalar</button>' +
      '<button class="ea-i-close" data-ea-close aria-label="Dispensar">&times;</button>'
    );
    b.querySelector('[data-ea-install]').addEventListener('click', function () {
      b.remove();
      if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; setDismissed(); }); }
    });
  });

  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('eaInstall'); if (b) b.remove();
    setDismissed();
  });

  // iPhone/iPad (Safari não tem prompt): instrução para "Adicionar à Tela de Início"
  window.addEventListener('load', function () {
    if (!isIOS() || isStandalone() || dismissed()) return;
    setTimeout(function () {
      var b = makeBanner(
        '<div class="ea-i-icon"><span>EA</span><i>.</i></div>' +
        '<div style="flex:1;min-width:0"><div class="ea-i-title">Adicione à Tela de Início</div>' +
        '<div class="ea-i-sub">Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</div></div>' +
        '<button class="ea-i-close" data-ea-close aria-label="Dispensar">&times;</button>'
      );
    }, 2500);
  });
})();
