// HomeCoffee Aqua apps: Finder, Konsol, TextEdit (Notes), and Settings (English, Esperanto, Yezik). Browser only.
(function () {
  'use strict';
  var STRINGS = {
    en: {
      finder: 'Finder', konsol: 'Terminal', notes: 'TextEdit', settings: 'Settings', collab: 'Collab Room',
      places: 'Places', home: 'Home', documents: 'Documents', applications: 'Applications', homecoffee: 'HomeCoffee',
      back: 'Back', forward: 'Forward', icons: 'Icons', list: 'List', language: 'Language',
      langLabel: 'Interface language', langSaved: 'Language saved.', save: 'Save',
      emptyFolder: 'This folder is empty.', fsError: 'Could not read this folder.', name: 'Name', size: 'Size', kind: 'Kind',
      folder: 'Folder', file: 'Document', prompt: 'Type a command', notesPlaceholder: 'Type your notes here...',
      konsolError: 'Command failed to run.', items: 'items'
    },
    eo: {
      finder: 'Dosiera Administrilo', konsol: 'Terminalo', notes: 'Tekstredaktilo', settings: 'Agordoj', collab: 'Kunlabora Ĉambro',
      places: 'Lokoj', home: 'Hejmo', documents: 'Dokumentoj', applications: 'Aplikaĵoj', homecoffee: 'HomeCoffee',
      back: 'Malantaŭen', forward: 'Antaŭen', icons: 'Piktogramoj', list: 'Listo', language: 'Lingvo',
      langLabel: 'Lingvo de la interfaco', langSaved: 'Lingvo konservita.', save: 'Konservi',
      emptyFolder: 'Ĉi tiu dosierujo estas malplena.', fsError: 'Ne eblis legi ĉi tiun dosierujon.', name: 'Nomo', size: 'Grandeco', kind: 'Speco',
      folder: 'Dosierujo', file: 'Dokumento', prompt: 'Tajpu komandon', notesPlaceholder: 'Tajpu viajn notojn ĉi tie...',
      konsolError: 'La komando ne ekfunkciis.', items: 'eroj'
    },
    yz: {
      finder: 'Fayl-Menaj', konsol: 'Konsol', notes: 'Tekst-Edit', settings: 'Setingi', collab: 'Kolab Lum',
      places: 'Mesta', home: 'Dom', documents: 'Dokumenti', applications: 'Aplikacii', homecoffee: 'HomeCoffee',
      back: 'Nazad', forward: 'Dalje', icons: 'Ikonki', list: 'Spisok', language: 'Yezik',
      langLabel: 'Yezik menaja', langSaved: 'Yezik sbegen.', save: 'Sbeg',
      emptyFolder: 'Papka pusta.', fsError: 'Ne mogu chitat papku.', name: 'Ime', size: 'Volum', kind: 'Tip',
      folder: 'Papka', file: 'Fayl', prompt: 'Pishi komandu', notesPlaceholder: 'Pishi notki zdes...',
      konsolError: 'Komanda ne sabotila.', items: 'elementi'
    }
  };
  var LANG_KEY = 'hc.lang', NOTES_KEY = 'hc.notes';
  var PLACES = [
    { key: 'home', path: '/root' },
    { key: 'documents', path: '/root/Documents' },
    { key: 'applications', path: '/root/Applications' },
    { key: 'homecoffee', path: '/opt/homecoffee' }
  ];

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  var lang = storeGet(LANG_KEY) || 'en';
  if (!STRINGS[lang]) lang = 'en';
  function t(k) { return (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.en[k] || k; }
  function $(id) { return document.getElementById(id); }

  // Language: English is the default. Yezik and Esperanto are chosen in Settings.
  function applyLang(code) {
    if (!STRINGS[code]) code = 'en';
    lang = code;
    document.documentElement.lang = code;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    var ph = $('notes-text'); if (ph) ph.setAttribute('placeholder', t('notesPlaceholder'));
    var inp = $('konsol-in'); if (inp) inp.setAttribute('placeholder', t('prompt'));
    storeSet(LANG_KEY, code);
    renderPlaces();
    renderFs();
  }

  // Finder: lists directories through /cgi-bin/fsls.cgi (allowed roots: /root and /opt/homecoffee).
  var cur = '/root', hist = [], histPos = -1, entries = [], view = 'icons', lastTap = { key: '', time: 0 };
  var fsOk = true;

  function join(base, name) { return base === '/' ? '/' + name : base + '/' + name; }
  function fmtSize(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }

  function renderPlaces() {
    var ul = $('places'); if (!ul) return;
    ul.innerHTML = '';
    PLACES.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'side-item' + (cur === p.path ? ' sel' : '');
      li.textContent = t(p.key);
      li.onclick = function () { go(p.path, true); };
      ul.appendChild(li);
    });
  }

  function updateNav() {
    var b = $('fz-back'), f = $('fz-fwd');
    if (b) b.disabled = histPos <= 0;
    if (f) f.disabled = histPos >= hist.length - 1;
    var path = $('fs-path'); if (path) path.textContent = cur;
    $('view-icons').setAttribute('aria-pressed', String(view === 'icons'));
    $('view-list').setAttribute('aria-pressed', String(view === 'list'));
  }

  function renderFs() {
    var main = $('fs-main'); if (!main) return;
    updateNav();
    renderPlaces();
    if (!fsOk) { main.innerHTML = '<div class="fs-empty"></div>'; main.firstChild.textContent = t('fsError'); $('fs-status').textContent = ''; return; }
    if (!entries.length) { main.innerHTML = '<div class="fs-empty"></div>'; main.firstChild.textContent = t('emptyFolder'); $('fs-status').textContent = '0 ' + t('items'); return; }
    main.innerHTML = '';
    if (view === 'icons') {
      var grid = document.createElement('div'); grid.className = 'fs-grid';
      entries.forEach(function (e) { grid.appendChild(makeItem(e, 'fs-item')); });
      main.appendChild(grid);
    } else {
      var tbl = document.createElement('table'); tbl.className = 'fs-list';
      tbl.innerHTML = '<thead><tr><th>' + t('name') + '</th><th>' + t('size') + '</th><th>' + t('kind') + '</th></tr></thead>';
      var tb = document.createElement('tbody');
      entries.forEach(function (e) {
        var tr = document.createElement('tr');
        tr.className = 'fs-row';
        tr.innerHTML = '<td></td><td></td><td></td>';
        tr.children[0].textContent = e.name;
        tr.children[1].textContent = e.type === 'dir' ? '--' : fmtSize(e.size);
        tr.children[2].textContent = e.type === 'dir' ? t('folder') : t('file');
        bindTap(tr, e);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      main.appendChild(tbl);
    }
    $('fs-status').textContent = entries.length + ' ' + t('items');
  }

  function makeItem(e) {
    var d = document.createElement('div');
    d.className = 'fs-item ' + e.type;
    var ico = document.createElement('div'); ico.className = 'fs-ico';
    var nm = document.createElement('div'); nm.className = 'fs-name'; nm.textContent = e.name;
    d.appendChild(ico); d.appendChild(nm);
    bindTap(d, e);
    return d;
  }

  // Double-click or double-tap (touch screens) activates an item: folders open, files show their size.
  function bindTap(el, e) {
    el.addEventListener('click', function () {
      var now = Date.now(), key = e.name;
      document.querySelectorAll('.fs-selected').forEach(function (s) { s.classList.remove('fs-selected'); });
      el.classList.add('fs-selected');
      if (lastTap.key === key && now - lastTap.time < 450) { lastTap = { key: '', time: 0 }; activate(e); }
      else lastTap = { key: key, time: now };
    });
    el.addEventListener('dblclick', function () { activate(e); });
  }

  function activate(e) {
    if (e.type === 'dir') go(join(cur, e.name), true);
    else $('fs-status').textContent = e.name + ' - ' + fmtSize(e.size);
  }

  function go(path, push) {
    fetch('/cgi-bin/fsls.cgi?path=' + encodeURIComponent(path), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { fsOk = false; entries = []; cur = path; }
        else { fsOk = true; cur = j.path; entries = j.entries.slice().sort(function (a, b) { if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name); }); }
        if (push && fsOk) { hist = hist.slice(0, histPos + 1); hist.push(cur); histPos = hist.length - 1; }
        renderFs();
      })
      .catch(function () { fsOk = false; entries = []; renderFs(); });
  }

  function navBack() { if (histPos > 0) { histPos -= 1; go(hist[histPos], false); } }
  function navFwd() { if (histPos < hist.length - 1) { histPos += 1; go(hist[histPos], false); } }

  // Konsol: each command is one POST to /cgi-bin/konsol.cgi that runs in the tracked working directory.
  var kCwd = '/root', kBusy = false;
  function konsolPrint(text) { var o = $('konsol-out'); o.textContent += text; o.scrollTop = o.scrollHeight; }
  function konsolPrompt() { $('konsol-prompt').textContent = kCwd + ' # '; }

  function konsolRun(cmd) {
    if (kBusy) return;
    kBusy = true;
    konsolPrint(kCwd + ' # ' + cmd + '\n');
    fetch('/cgi-bin/konsol.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ cmd: cmd, cwd: kCwd }).toString()
    })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var i = text.lastIndexOf('__PWD__');
        if (i >= 0) { kCwd = text.slice(i + 7).trim() || kCwd; text = text.slice(0, i); }
        if (text) konsolPrint(text.endsWith('\n') ? text : text + '\n');
      })
      .catch(function () { konsolPrint(t('konsolError') + '\n'); })
      .then(function () { kBusy = false; konsolPrompt(); });
  }

  // Settings and Notes
  function bindSettings() {
    var sel = $('lang-select');
    if (sel) { sel.value = lang; sel.addEventListener('change', function () { applyLang(sel.value); $('lang-status').textContent = t('langSaved'); }); }
  }

  function bindNotes() {
    var ta = $('notes-text'); if (!ta) return;
    ta.value = storeGet(NOTES_KEY) || '';
    ta.addEventListener('input', function () { storeSet(NOTES_KEY, ta.value); });
  }

  function bindFinder() {
    $('fz-back').onclick = navBack;
    $('fz-fwd').onclick = navFwd;
    $('view-icons').onclick = function () { view = 'icons'; renderFs(); };
    $('view-list').onclick = function () { view = 'list'; renderFs(); };
  }

  function bindKonsol() {
    var inp = $('konsol-in');
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var cmd = inp.value.trim();
      inp.value = '';
      if (cmd) konsolRun(cmd);
    });
    konsolPrint('HomeCoffee Konsol\n');
    konsolPrompt();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('finder-window')) return;
    applyLang(lang);
    bindSettings();
    bindNotes();
    bindFinder();
    bindKonsol();
    go('/root', true);
  });

  window.RedStarApps = { applyLang: applyLang, go: go };
})();
