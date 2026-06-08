/* EA English Classes — registro do PWA + instalação (Android/iPhone) */
(function () {
  if (!('serviceWorker' in navigator)) return;

  // Registra o service worker após o carregamento (não atrasa a página)
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      // Acompanha mudanças do site: ao detectar nova versão, ativa e recarrega 1x.
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('SKIP_WAITING');
        });
      });
    }).catch(function (err) { console.warn('SW falhou:', err); });
    var _eaReloaded = false;
    if (navigator.serviceWorker.controller) {
      // Já havia um controlador → uma nova versão deve recarregar (acompanha o site).
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (_eaReloaded) return; _eaReloaded = true; window.location.reload();
      });
    }
  });

  var deferred = null;
  var KEY = 'ea_pwa_dismissed';

  // Keyframes globais (modal de instalação, banner e toast)
  (function () {
    if (document.getElementById('eaPwaKf')) return;
    var s = document.createElement('style');
    s.id = 'eaPwaKf';
    s.textContent = '@keyframes eaSlideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
      '@keyframes eaFade{from{opacity:0}to{opacity:1}}';
    (document.head || document.documentElement).appendChild(s);
  })();

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
    eaToast('App instalado! Procure o ícone "EA." na tela inicial. 🎉');
  });

  // Toast leve (reutiliza estilo simples)
  function eaToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;' +
      'background:#19244e;color:#fff;padding:13px 20px;border-radius:12px;font-family:inherit;font-size:14px;' +
      'font-weight:600;box-shadow:0 12px 40px rgba(25,36,78,.3);max-width:90vw;text-align:center;' +
      'animation:eaSlideUp .3s ease';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 400); }, 4200);
  }

  // Modal de instruções (iOS / desktop) — quando não há prompt nativo
  function eaInstructionsModal(kind) {
    var steps = kind === 'ios'
      ? '<ol style="margin:0;padding-left:20px;line-height:2;color:#374151;font-size:15px">' +
          '<li>Toque no botão <strong>Compartilhar</strong> <span style="display:inline-flex;vertical-align:-4px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f36b2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> na barra do Safari.</li>' +
          '<li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>' +
          '<li>Toque em <strong>Adicionar</strong> — pronto!</li>' +
        '</ol>'
      : '<ol style="margin:0;padding-left:20px;line-height:2;color:#374151;font-size:15px">' +
          '<li>No Chrome/Edge, clique no ícone de <strong>instalar</strong> <span style="display:inline-flex;vertical-align:-4px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f36b2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 8v6M9 11l3 3 3-3"/></svg></span> na barra de endereço.</li>' +
          '<li>Ou abra o menu <strong>⋮</strong> e escolha <strong>Instalar app</strong>.</li>' +
          '<li>Confirme em <strong>Instalar</strong>.</li>' +
        '</ol>';
    var ov = document.createElement('div');
    ov.id = 'eaInstallModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(16,23,51,.55);backdrop-filter:blur(3px);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;animation:eaFade .25s ease';
    ov.innerHTML =
      '<div role="dialog" aria-label="Como instalar o app" style="background:#fff;border-radius:22px;max-width:400px;width:100%;' +
        'padding:28px 26px;box-shadow:0 30px 80px rgba(16,23,51,.4);animation:eaSlideUp .3s cubic-bezier(.16,1,.3,1)">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">' +
          '<div style="width:48px;height:48px;border-radius:13px;background:#19244e;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:800;font-size:22px">EA<span style="color:#f36b2e">.</span></div>' +
          '<div><div style="font-family:Georgia,serif;font-weight:800;font-size:19px;color:#19244e">Instalar o app</div>' +
          '<div style="font-size:13px;color:#6b7280">' + (kind === 'ios' ? 'No iPhone/iPad (Safari)' : 'No computador') + '</div></div>' +
        '</div>' + steps +
        '<button type="button" data-ea-close-modal style="margin-top:22px;width:100%;background:#f36b2e;color:#fff;border:none;' +
          'border-radius:13px;padding:14px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;min-height:48px">Entendi</button>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-ea-close-modal]')) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }

  // API pública: chamada pelo botão da seção "Baixe o app"
  window.eaInstallApp = function () {
    if (isStandalone()) { eaToast('O app já está instalado. 🎉'); return; }
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; });
      return;
    }
    eaInstructionsModal(isIOS() ? 'ios' : 'desktop');
  };

  window.eaIsAppInstalled = function () { return isStandalone(); };

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
