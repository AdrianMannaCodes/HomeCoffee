// HomeCoffee Aqua apps: Finder, Terminal, TextEdit (rich text, saves to /root/Documents via fsops.cgi), and Settings (English, Esperanto, Yezik). Browser only.
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
      konsolError: 'Command failed to run.', items: 'items',
      teWords: 'words', teChars: 'characters', teSaved: 'Saved', teSaveFail: 'Could not save', teOpenFail: 'Could not open',
      teOpened: 'Opened', teSavePrompt: 'Save as (file name, or full path; .html or .txt):', teOverwrite: 'Replace the existing file',
      teOpenPrompt: 'Open file (full path):', teDiscard: 'Discard unsaved changes?', teTxtWarn: 'Plain text: formatting is not kept in .txt files.'
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
  var LANG_KEY = 'hc.lang', NOTES_KEY = 'hc.notes', NOTES_HTML_KEY = 'hc.notes.html', TE_FILE_KEY = 'hc.notes.file';
  var TE_DIR = '/root/Documents';
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
    var ed = $('notes-text'); if (ed) ed.setAttribute('data-placeholder', t('notesPlaceholder'));
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
      entries.forEach(function (e) { grid.appendChild(makeItem(e)); });
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

  // File API: /cgi-bin/fsops.cgi (loopback only, paths limited to /root and /opt/homecoffee).
  // GET = read (raw text on success); POST with a text body = write. Errors come back as JSON.
  function fsCall(action, path, body) {
    var opts = { method: body === undefined ? 'GET' : 'POST', cache: 'no-store' };
    if (body !== undefined) { opts.headers = { 'Content-Type': 'text/plain; charset=utf-8' }; opts.body = body; }
    return fetch('/cgi-bin/fsops.cgi?action=' + action + '&path=' + encodeURIComponent(path), opts)
      .then(function (r) {
        return r.text().then(function (txt) {
          var j = null;
          if (r.status !== 200 || body !== undefined) { try { j = JSON.parse(txt); } catch (e) { j = null; } }
          return { status: r.status, text: txt, json: j };
        });
      });
  }

  // TextEdit: rich text in a contenteditable surface. Documents save as styled HTML (.html) or plain text (.txt).
  var teFile = null, teDirty = false, teSaveTimer = null, teRange = null;

  function teEditor() { return $('notes-text'); }
  function teMsg(msg) { var s = $('te-msg'); if (s) s.textContent = msg || ''; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function teCounts() {
    var ed = teEditor(); if (!ed) return;
    var text = (ed.innerText || '').replace(/\u00a0/g, ' ');
    var trimmed = text.trim();
    var words = trimmed ? trimmed.split(/\s+/).length : 0;
    var chars = text.replace(/\n/g, '').length;
    var el = $('te-counts'); if (el) el.textContent = words + ' ' + t('teWords') + ' | ' + chars + ' ' + t('teChars');
  }

  // Remove anything active from HTML before it goes into the editor.
  function teSanitize(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.body;
    body.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach(function (n) { n.parentNode.removeChild(n); });
    body.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var nm = a.name.toLowerCase();
        if (nm.indexOf('on') === 0 || ((nm === 'href' || nm === 'src') && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
      });
    });
    return body.innerHTML;
  }

  function teSerialize() {
    var title = teFile ? teFile.split('/').pop() : 'Untitled';
    return '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="generator" content="HomeCoffee TextEdit">\n<title>' + esc(title) + '</title>\n</head>\n<body>\n' +
      teEditor().innerHTML + '\n</body>\n</html>\n';
  }

  function teAutosave() {
    var ed = teEditor(); if (!ed) return;
    storeSet(NOTES_HTML_KEY, ed.innerHTML);
    storeSet(TE_FILE_KEY, teFile || '');
  }

  function teChanged() {
    teDirty = true;
    teCounts();
    clearTimeout(teSaveTimer);
    teSaveTimer = setTimeout(teAutosave, 400);
  }

  // Keep the editor selection while toolbar controls (selects, color pickers) have focus.
  function teTrackSel() {
    var s = window.getSelection();
    var ed = teEditor();
    if (s && s.rangeCount && ed && ed.contains(s.anchorNode)) teRange = s.getRangeAt(0).cloneRange();
  }
  function teRestore() {
    var ed = teEditor(); if (!ed) return;
    ed.focus();
    if (teRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(teRange); }
  }

  function teCmd(cmd, val) {
    teRestore();
    document.execCommand(cmd, false, val === undefined ? null : val);
    teChanged();
    teUpdateState();
  }

  function teSetSize(px) {
    teRestore();
    document.execCommand('fontSize', false, '7');
    teEditor().querySelectorAll('font[size="7"]').forEach(function (f) {
      var sp = document.createElement('span');
      sp.style.fontSize = px + 'px';
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.parentNode.replaceChild(sp, f);
    });
    teChanged();
  }

  function teUpdateState() {
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) {
      var b = document.querySelector('[data-te-cmd="' + c + '"]');
      if (!b) return;
      var on = false;
      try { on = document.queryCommandState(c); } catch (e) { on = false; }
      b.setAttribute('aria-pressed', String(!!on));
    });
  }

  function teWrite(path) {
    var isText = /\.txt$/i.test(path);
    var body = isText ? teEditor().innerText : teSerialize();
    return fsCall('write', path, body).then(function (r) {
      if (r.json && r.json.ok) {
        teFile = path; teDirty = false; teAutosave();
        teMsg(t('teSaved') + ': ' + path + (isText ? ' (' + t('teTxtWarn') + ')' : ''));
      } else {
        teMsg(t('teSaveFail') + ': ' + (r.json ? r.json.error : r.status));
      }
    }).catch(function () { teMsg(t('teSaveFail')); });
  }

  function tePath(name) {
    name = name.trim();
    return name.charAt(0) === '/' ? name : TE_DIR + '/' + name;
  }

  function teSave(asNew) {
    if (!teFile || asNew) return teSaveAs();
    return teWrite(teFile);
  }

  function teSaveAs() {
    var suggested = teFile ? teFile.split('/').pop() : 'Untitled.html';
    var name = window.prompt(t('teSavePrompt'), suggested);
    if (!name || !name.trim()) return Promise.resolve();
    var path = tePath(name);
    if (!/\.(html?|txt)$/i.test(path)) path += '.html';
    return fsCall('read', path).then(function (r) {
      if (r.status === 200 && !window.confirm(t('teOverwrite') + ': ' + path + '?')) return;
      return teWrite(path);
    });
  }

  function teOpenPath(path) {
    return fsCall('read', path).then(function (r) {
      if (r.status !== 200) { teMsg(t('teOpenFail') + ': ' + (r.json ? r.json.error : r.status)); return; }
      var ed = teEditor();
      if (/\.html?$/i.test(path)) {
        ed.classList.remove('te-plain');
        ed.innerHTML = teSanitize(r.text);
      } else {
        ed.classList.add('te-plain');
        ed.textContent = r.text;
      }
      teFile = path; teDirty = false;
      teCounts(); teAutosave();
      teMsg(t('teOpened') + ': ' + path);
    }).catch(function () { teMsg(t('teOpenFail')); });
  }

  function teShow() { var w = $('notes-window'); if (w) w.style.display = ''; }

  function teTogglePreview() {
    var win = $('notes-window');
    var on = !win.classList.contains('te-preview');
    win.classList.toggle('te-preview', on);
    teEditor().setAttribute('contenteditable', on ? 'false' : 'true');
    $('te-preview').setAttribute('aria-pressed', String(on));
  }

  function bindTextEdit() {
    var ed = teEditor(); if (!ed) return;
    ed.addEventListener('input', teChanged);
    ed.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 's') { e.preventDefault(); teSave(e.shiftKey); }
    });
    document.addEventListener('selectionchange', function () { teTrackSel(); teUpdateState(); });

    // Toolbar buttons keep focus in the editor (mousedown is cancelled), so the selection survives the click.
    document.querySelectorAll('[data-te-cmd]').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { teCmd(b.getAttribute('data-te-cmd'), b.getAttribute('data-te-val') || undefined); });
    });

    $('te-font').addEventListener('change', function (e) { teRestore(); document.execCommand('fontName', false, e.target.value); teChanged(); });
    $('te-size').addEventListener('change', function (e) { teSetSize(parseInt(e.target.value, 10)); });
    $('te-fore').addEventListener('input', function (e) { teRestore(); document.execCommand('foreColor', false, e.target.value); teChanged(); });
    $('te-hilite').addEventListener('input', function (e) {
      teRestore();
      var c = 'hiliteColor';
      try { if (!document.queryCommandSupported(c)) c = 'backColor'; } catch (err) { c = 'backColor'; }
      document.execCommand(c, false, e.target.value);
      teChanged();
    });

    $('te-new').addEventListener('click', function () {
      if (teDirty && !window.confirm(t('teDiscard'))) return;
      teFile = null; teDirty = false;
      ed.innerHTML = ''; ed.classList.remove('te-plain');
      teCounts(); teAutosave(); teMsg('');
    });
    $('te-open').addEventListener('click', function () {
      var p = window.prompt(t('teOpenPrompt'), TE_DIR + '/');
      if (p && p.trim()) teOpenPath(tePath(p));
    });
    $('te-save').addEventListener('click', function () { teSave(false); });
    $('te-saveas').addEventListener('click', function () { teSave(true); });
    $('te-preview').addEventListener('click', teTogglePreview);
    $('te-print').addEventListener('click', function () { window.print(); });
  }

  function teInit() {
    var ed = teEditor(); if (!ed) return;
    var html = storeGet(NOTES_HTML_KEY);
    if (html !== null) ed.innerHTML = teSanitize(html);
    else {
      var legacy = storeGet(NOTES_KEY) || '';
      if (legacy) ed.textContent = legacy;
    }
    teFile = storeGet(TE_FILE_KEY) || null;
    if (teFile === '') teFile = null;
    teCounts();
    teUpdateState();
  }

  function bindSettings() {
    var sel = $('lang-select');
    if (sel) { sel.value = lang; sel.addEventListener('change', function () { applyLang(sel.value); $('lang-status').textContent = t('langSaved'); }); }
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
    teInit();
    bindTextEdit();
    bindFinder();
    bindKonsol();
    go('/root', true);
  });

  window.RedStarApps = {
    applyLang: applyLang,
    go: go,
    openFile: function (path) { teShow(); return teOpenPath(path); },
    saveFile: function () { return teSave(false); }
  };
})();
