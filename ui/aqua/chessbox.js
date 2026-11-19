// ChessBox: read-only package inspector for Aqua. Browser only.
// Reads a DMG file the user picks and reports its UDIF trailer (koly block). Reads an XML plist (Info.plist or a package manifest) and lists its keys. It never decompresses, mounts, or writes files. Customization is saved as a JSON focus choice in localStorage only.
(function () {
  'use strict';
  var KOLY_SIZE = 512;
  var MAX_DMG = 2147483648; // 2 GB cap on what the browser will read
  var MAX_PLIST = 5242880;  // 5 MB cap on a plist
  var FOCUS_KEY = 'hc.chessbox.focus';

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; }
  function u32(dv, o) { return dv.getUint32(o, false); }
  function u64(dv, o) { return dv.getUint32(o, false) * 4294967296 + dv.getUint32(o + 4, false); }

  // Parse the UDIF trailer. Field offsets follow the public UDIF layout (big-endian).
  // Only the 512-byte block at the end is read; no compressed data is touched.
  function parseDmgTrailer(buf) {
    if (buf.byteLength < KOLY_SIZE) return { ok: false, error: 'File is smaller than a DMG trailer.' };
    var dv = new DataView(buf, buf.byteLength - KOLY_SIZE, KOLY_SIZE);
    var sig = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (sig !== 'koly') return { ok: false, error: 'Not a UDIF disk image (no koly trailer).' };
    var version = u32(dv, 4);
    var headerSize = u32(dv, 8);
    var flags = u32(dv, 12);
    var dataForkOffset = u64(dv, 24), dataForkLength = u64(dv, 32);
    var xmlOffset = u64(dv, 216), xmlLength = u64(dv, 224);
    var sectorCount = u64(dv, 492);
    var rep = {
      ok: true,
      version: version,
      headerSize: headerSize,
      flags: flags,
      encrypted: (flags & 0x2) !== 0,
      dataForkOffset: dataForkOffset,
      dataForkLength: dataForkLength,
      xmlOffset: xmlOffset,
      xmlLength: xmlLength,
      sectorCount: sectorCount,
      sizeBytes: sectorCount * 512,
      fileBytes: buf.byteLength,
      checks: []
    };
    rep.checks.push(version === 4 ? 'UDIF version 4 (ok)' : 'Unexpected UDIF version ' + version + '.');
    rep.checks.push(headerSize === KOLY_SIZE ? 'Trailer size 512 (ok)' : 'Unexpected trailer size ' + headerSize + '.');
    if (rep.encrypted) rep.checks.push('Image is encrypted. Its contents cannot be inspected here.');
    if (xmlOffset + xmlLength > buf.byteLength) rep.checks.push('Property list points past the end of the file.');
    return rep;
  }

  // Read the embedded XML property list, if it is inside the file.
  function readEmbeddedXml(buf, rep) {
    if (!rep.xmlLength || rep.xmlLength > MAX_PLIST) return null;
    if (rep.xmlOffset + rep.xmlLength > buf.byteLength) return null;
    return new TextDecoder('utf-8').decode(new Uint8Array(buf, rep.xmlOffset, rep.xmlLength));
  }

  // Minimal XML plist reader: returns a flat list of key/value pairs at the top level of the root dict.
  function parsePlist(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { ok: false, error: 'Not a valid XML property list.' };
    var root = doc.getElementsByTagName('plist')[0];
    var dict = root && root.firstElementChild;
    if (!dict || dict.nodeName !== 'dict') return { ok: false, error: 'The property list root is not a dictionary.' };
    var out = [];
    var kids = Array.prototype.slice.call(dict.children);
    for (var i = 0; i + 1 < kids.length; i += 2) {
      var k = kids[i], v = kids[i + 1];
      if (k.nodeName !== 'key') continue;
      out.push({ key: k.textContent, type: v.nodeName, value: v.nodeName === 'dict' || v.nodeName === 'array' ? '(' + v.nodeName + ', ' + v.children.length + ' items)' : v.textContent });
    }
    return { ok: true, entries: out };
  }

  function readFile(file, max, cb) {
    if (file.size > max) { cb(new Error('File is too large to inspect here (limit ' + Math.round(max / 1048576) + ' MB).')); return; }
    var r = new FileReader();
    r.onload = function () { cb(null, r.result); };
    r.onerror = function () { cb(new Error('Could not read the file.')); };
    r.readAsArrayBuffer(file);
  }

  function show(out, rows) {
    out.innerHTML = '';
    rows.forEach(function (r) {
      var line = mk('div', 'cb-row');
      line.appendChild(mk('span', 'cb-k', r[0]));
      line.appendChild(mk('span', 'cb-v', String(r[1])));
      out.appendChild(line);
    });
  }

  function saveFocus(name) { try { localStorage.setItem(FOCUS_KEY, JSON.stringify({ focus: name, at: new Date().toISOString() })); return true; } catch (e) { return false; } }
  function loadFocus() { try { return JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null'); } catch (e) { return null; } }

  function buildWindow() {
    var win = mk('section', 'window cb-window');
    win.id = 'chessbox-window';
    win.style.cssText = 'left:150px;top:90px;width:600px;height:460px;display:none;';
    win.innerHTML =
      '<div class="titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">ChessBox</div></div>' +
      '<div class="cb-toolbar">' +
        '<label class="cb-pick">Open DMG or plist <input type="file" id="cb-file" accept=".dmg,.plist,.xml,application/xml,text/xml" hidden></label>' +
        '<span class="cb-note">Read only. Nothing is mounted or changed.</span>' +
      '</div>' +
      '<div class="cb-out" id="cb-out"><div class="cb-empty">Choose a .dmg file or an XML .plist file to inspect.</div></div>' +
      '<div class="cb-focus">' +
        '<span>Package focus:</span>' +
        '<select id="cb-focus" class="aqua-field" aria-label="Package focus">' +
          '<option value="">None</option><option value="pabari">Pabari</option><option value="konsol">Konsol</option><option value="textedit">TextEdit</option><option value="finder">Finder</option>' +
        '</select>' +
        '<button class="aqua-btn" id="cb-save">Save focus</button>' +
        '<span id="cb-msg" class="cb-note"></span>' +
      '</div>';
    document.getElementById('stage').appendChild(win);
    return win;
  }

  function boot() {
    var win = buildWindow();
    win.querySelector('.light.close').addEventListener('click', function (e) { e.stopPropagation(); win.style.display = 'none'; });
    win.querySelector('.light.minimize').addEventListener('click', function (e) { e.stopPropagation(); win.style.display = 'none'; });
    var out = win.querySelector('#cb-out');
    var file = win.querySelector('#cb-file');
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      out.innerHTML = '';
      var isDmg = /\.dmg$/i.test(f.name);
      readFile(f, isDmg ? MAX_DMG : MAX_PLIST, function (err, buf) {
        if (err) { show(out, [['Error', err.message]]); return; }
        if (isDmg) {
          var rep = parseDmgTrailer(buf);
          if (!rep.ok) { show(out, [['Error', rep.error]]); return; }
          var rows = [['File', f.name], ['Size', f.size + ' bytes'], ['UDIF version', rep.version], ['Trailer size', rep.headerSize], ['Encrypted', rep.encrypted ? 'yes' : 'no'], ['Data fork', rep.dataForkLength + ' bytes at ' + rep.dataForkOffset], ['Virtual disk size', rep.sizeBytes + ' bytes']];
          rep.checks.forEach(function (c) { rows.push(['Check', c]); });
          var xml = readEmbeddedXml(buf, rep);
          if (xml) {
            var pl = parsePlist(xml);
            if (pl.ok) pl.entries.slice(0, 40).forEach(function (e) { rows.push(['Plist ' + e.key, e.value]); });
            else rows.push(['Plist', pl.error]);
          }
          show(out, rows);
        } else {
          var text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
          var p = parsePlist(text);
          if (!p.ok) { show(out, [['Error', p.error]]); return; }
          show(out, [['File', f.name]].concat(p.entries.map(function (e) { return [e.key, e.value]; })));
        }
      });
    });
    win.querySelector('#cb-save').addEventListener('click', function () {
      var v = win.querySelector('#cb-focus').value;
      win.querySelector('#cb-msg').textContent = saveFocus(v) ? 'Saved: ' + (v || 'none') : 'Could not save';
    });
    var saved = loadFocus();
    if (saved && saved.focus) win.querySelector('#cb-focus').value = saved.focus;

    var dock = document.getElementById('dock');
    if (dock) {
      var item = mk('div', 'dock-item dock-chessbox'); item.setAttribute('data-app', 'chessbox-window'); item.title = 'ChessBox';
      item.appendChild(mk('span', '', 'ChessBox'));
      dock.insertBefore(item, dock.querySelector('.dock-collab'));
      item.addEventListener('click', function () { if (window.RedStarWM) window.RedStarWM.show(win); else win.style.display = ''; });
    }
    if (window.RedStarWM) window.RedStarWM.hide(win); else win.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () { if (document.getElementById('stage')) boot(); });
  window.ChessBox = { parseDmgTrailer: parseDmgTrailer, parsePlist: parsePlist };
})();
