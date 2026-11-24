// Infinite Mac launcher: opens the Macintosh G4 (PowerPC) emulator from https://infinitemac.org/ in a new browser tab. Browser only.
(function () {
  'use strict';
  var WM = window.RedStarWM;
  if (!WM) return;
  var ORIGIN = 'https://infinitemac.org/embed';
  // Boot disk: Infinite Mac system disk key, displayName + " - " + displaySubtitle (disks.ts MAC_OS_X_10_4_11, preferredMachine POWER_MACINTOSH_G4_PEARPC).
  var SYSTEM_DISK = 'Mac OS X 10.4 - Tiger';
  // Additional disk, added the way Infinite Mac's plus button does: a repeated disk_url parameter (run-def.ts reads searchParams.getAll("disk_url")). Hosted on archive.org; uploaded by the nightly workflow (item homecoffee-infinitemac).
  var DISK_URL = 'https://archive.org/download/homecoffee-infinitemac/HomeCoffee-InfiniteMac.img';
  var MACHINE = 'Power Macintosh G4 (PCI Graphics)';
  var TITLE = 'Macintosh G4';
  var DOCK_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="imcase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#b8bcc4"/></linearGradient></defs><rect x="8" y="8" width="48" height="38" rx="5" fill="url(#imcase)" stroke="#6b7180"/><rect x="13" y="13" width="38" height="27" rx="2" fill="#3b6fb6"/><rect x="13" y="13" width="38" height="27" rx="2" fill="#ffffff" opacity="0.12"/><rect x="26" y="46" width="12" height="5" fill="#9aa1ad"/><rect x="18" y="51" width="28" height="4" rx="2" fill="#6b7180"/></svg>';

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  // Builds the embed URL: machine, boot system disk (disk), the extra disk (disk_url), and library=false to skip the background software catalog load (run-def.ts: includeLibrary = library !== "false").
  function buildEmbedUrl() {
    var params = new URLSearchParams();
    params.set('machine', MACHINE);
    params.append('disk', SYSTEM_DISK);
    params.append('disk_url', DISK_URL);
    params.set('library', 'false');
    return ORIGIN + '?' + params.toString();
  }

  // Opens the emulator as a top-level page in a new tab. Called from a click handler, so popup blockers allow it.
  function openInNewTab() {
    window.open(buildEmbedUrl(), '_blank');
  }

  function boot() {
    var dock = document.getElementById('dock');
    if (dock) {
      var item = mk('div', 'dock-item dock-infinitemac');
      item.title = TITLE;
      item.innerHTML = DOCK_ICON + '<span>' + TITLE + '</span>';
      dock.insertBefore(item, dock.querySelector('.dock-collab'));
      item.addEventListener('click', openInNewTab);
    }

    var panel = document.getElementById('app-menu');
    if (panel) {
      var b = mk('button', '', TITLE);
      b.addEventListener('click', function () {
        panel.style.display = 'none';
        var t = document.getElementById('menu-apps');
        if (t) t.classList.remove('open');
        openInNewTab();
      });
      panel.appendChild(b);
    }
  }
  boot();
})();
