// HomeCoffee Aqua extras: Activity Monitor, Disk Utility, draggable desktop files, and the Applications menu. Browser only.
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  var WM = window.RedStarWM;
  if (!stage || !WM) return;
  var root = document.documentElement;
  var DESK_DIR = '/root/Desktop';
  var DESK_KEY = 'hc.desk.items';

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function scale() { return parseFloat(getComputedStyle(root).getPropertyValue('--display-scale')) || 1; }
  function stageW() { return stage.offsetWidth || 1024; }
  function stageH() { return stage.offsetHeight || 768; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function join(b, n) { return b === '/' ? '/' + n : b + '/' + n; }
  function parentOf(p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  function baseOf(p) { return p.slice(p.lastIndexOf('/') + 1); }
  function isTextFile(n) { var l = n.toLowerCase(); return l.slice(-4) === '.txt' || l.slice(-5) === '.html' || l.slice(-4) === '.htm'; }
  function fmtBytes(n) { if (!n || n < 0) return '0 B'; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(i ? 1 : 0) + ' ' + u[i]; }
  function getJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function timeStamp() { return new Date().toTimeString().slice(0, 8); }
  function parseReply(r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) { j = null; } return { status: r.status, ok: r.ok, text: t, json: j }; }); }

  // Window factory: same Aqua chrome as the existing windows (traffic lights, draggable titlebar, focus on press).
  function makeWindow(id, title, bodyHTML, g) {
    var win = mk('section', 'window');
    win.id = id;
    win.style.cssText = 'left:' + g.left + 'px;top:' + g.top + 'px;width:' + g.width + 'px;height:' + g.height + 'px;display:none;';
    win.innerHTML = '<div class="titlebar"><div class="lights"><span class="light close"></span><span class="light minimize"></span><span class="light zoom"></span></div><div class="title">' + esc(title) + '</div></div>' + bodyHTML;
    stage.appendChild(win);
    win.addEventListener('pointerdown', function () { WM.focus(win); }, true);
    var hideBtn = function (e) { e.stopPropagation(); WM.hide(win); };
    win.querySelector('.light.close').addEventListener('click', hideBtn);
    win.querySelector('.light.minimize').addEventListener('click', hideBtn);
    var bar = win.querySelector('.titlebar');
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.light')) return;
      var s = scale(), sx = e.clientX, sy = e.clientY, ol = win.offsetLeft, ot = win.offsetTop;
      function mv(ev) { win.style.left = Math.max(0, ol + (ev.clientX - sx) / s) + 'px'; win.style.top = Math.max(22, ot + (ev.clientY - sy) / s) + 'px'; }
      function up() { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); }
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    return win;
  }

  function openApp(id) {
    var w = $(id); if (!w) return;
    if (w.style.display === 'none') WM.show(w); else WM.focus(w);
    if (id === 'activity-window') amTick();
    if (id === 'diskutil-window') duLoad();
  }

  // ---------- Activity Monitor ----------
  var AM_SAMPLE = [
    { pid: 1, name: 'init', user: 'root', mem: 6291456 },
    { pid: 212, name: 'home-collab', user: 'root', mem: 25165824 },
    { pid: 318, name: 'busybox httpd', user: 'root', mem: 3145728 },
    { pid: 402, name: 'konsol.cgi', user: 'www', mem: 2097152 },
    { pid: 415, name: 'fsls.cgi', user: 'www', mem: 2097152 },
    { pid: 520, name: 'sshd', user: 'root', mem: 4194304 },
    { pid: 611, name: 'Progressbar', user: 'root', mem: 8388608 }
  ];
  var AM_BODY = '<div class="metal-toolbar"><div class="pill-group"><button class="pill" id="am-quit" aria-label="Force Quit">Force Quit</button></div><span class="am-src" id="am-src"></span></div>' +
    '<div class="am-top"><div class="am-card"><div class="am-h">CPU</div><canvas id="am-cpu"></canvas><div class="am-val" id="am-cpu-val"></div></div>' +
    '<div class="am-card"><div class="am-h">Memory</div><div class="am-meter"><div class="am-fill" id="am-mem-fill"></div></div><div class="am-val" id="am-mem-val"></div></div></div>' +
    '<div class="am-procs"><table class="fs-list"><thead><tr><th>Process</th><th>PID</th><th>User</th><th>CPU %</th><th>Memory</th></tr></thead><tbody id="am-rows"></tbody></table></div>' +
    '<div class="fs-status" id="am-status"></div>';
  var amHist = [], amProcs = [], amLive = false, amSel = null, amBusy = false;

  function amSim() {
    var prev = amHist.length ? amHist[amHist.length - 1] : 20;
    var cpu = clamp(prev + (Math.random() * 24 - 12), 2, 96);
    var total = 2147483648, used = total * (0.32 + Math.random() * 0.2);
    var procs = AM_SAMPLE.map(function (p) { return { pid: p.pid, name: p.name, user: p.user, cpu: p.pid === 212 ? cpu * 0.6 : Math.random() * 4, mem: p.mem }; });
    return { live: false, cpu: cpu, mem: { total: total, used: used }, procs: procs };
  }
  function amSample() {
    return getJSON('/cgi-bin/sysstat.cgi').then(function (j) {
      return { live: true, cpu: Number(j.cpu) || 0, mem: j.mem || { total: 0, used: 0 }, procs: j.procs || [] };
    }).catch(function () { return amSim(); });
  }
  function amTick() {
    if (amBusy) return;
    amBusy = true;
    amSample().then(function (s) {
      amBusy = false; amLive = s.live;
      amHist.push(s.cpu); if (amHist.length > 60) amHist.shift();
      amProcs = s.procs;
      amRender(s);
    });
  }
  function amRender(s) {
    amDraw();
    $('am-cpu-val').textContent = 'CPU load: ' + s.cpu.toFixed(0) + '%';
    var pct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
    $('am-mem-fill').style.width = clamp(pct, 0, 100).toFixed(1) + '%';
    $('am-mem-val').textContent = 'Physical memory: ' + fmtBytes(s.mem.used) + ' used of ' + fmtBytes(s.mem.total) + ' (' + pct.toFixed(0) + '%)';
    $('am-src').textContent = s.live ? 'Live data' : 'Sample data (no sysstat endpoint on this build)';
    var body = $('am-rows');
    var list = amProcs.slice().sort(function (a, b) { return b.cpu - a.cpu; });
    body.innerHTML = '';
    list.forEach(function (p) {
      var tr = mk('tr', p.pid === amSel ? 'sel' : '');
      [p.name, String(p.pid), p.user, Number(p.cpu).toFixed(1), fmtBytes(p.mem)].forEach(function (txt) { var td = mk('td'); td.textContent = txt; tr.appendChild(td); });
      tr.addEventListener('click', function () { amSel = p.pid; amRender(s); });
      body.appendChild(tr);
    });
  }
  function amDraw() {
    var c = $('am-cpu'); if (!c) return;
    var w = c.clientWidth || 300, h = c.clientHeight || 90;
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1626'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(158,201,255,0.18)'; ctx.lineWidth = 1;
    for (var y = 15; y < h; y += 15) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    var n = amHist.length; if (n < 2) return;
    var step = w / 59;
    ctx.strokeStyle = '#6fb1ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var x = (60 - n + i) * step, yy = h - (amHist[i] / 100) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  function amQuit() {
    var p = null;
    amProcs.forEach(function (q) { if (q.pid === amSel) p = q; });
    if (!p) { $('am-status').textContent = 'Select a process first.'; return; }
    if (!amLive) { $('am-status').textContent = 'Force quit is unavailable on sample data. This build has no process control endpoint, so nothing was stopped.'; return; }
    if (!window.confirm('Force quit ' + p.name + ' (PID ' + p.pid + ')? Unsaved work in it will be lost.')) return;
    fetch('/cgi-bin/procctl.cgi?action=kill&pid=' + encodeURIComponent(p.pid), { method: 'POST', cache: 'no-store' })
      .then(parseReply)
      .then(function (r) { $('am-status').textContent = r.ok ? 'Force quit sent to ' + p.name + '.' : 'Force quit failed: ' + (r.text || 'error'); amSel = null; amTick(); })
      .catch(function () { $('am-status').textContent = 'Force quit failed: no process control endpoint is reachable.'; });
  }

  // ---------- Disk Utility ----------
  var DU_SAMPLE = [
    { id: 'root', name: 'BarOS System', mount: '/', total: 4294967296, used: 1932735283 },
    { id: 'home', name: 'Home', mount: '/root', total: 2147483648, used: 503316480 },
    { id: 'homecoffee', name: 'HomeCoffee', mount: '/opt/homecoffee', total: 1073741824, used: 268435456 }
  ];
  var DU_ACTIONS = { verify: 'First Aid (Verify Disk)', repair: 'Repair Disk', perms: 'Verify Permissions', 'repair-perms': 'Repair Permissions', cleanup: 'Clean Up' };
  var DU_BODY = '<div class="metal-toolbar"><div class="pill-group"><button class="pill" id="du-verify">First Aid</button><button class="pill" id="du-repair">Repair Disk</button></div>' +
    '<div class="pill-group"><button class="pill" id="du-perms">Verify Permissions</button><button class="pill" id="du-repair-perms">Repair Permissions</button></div>' +
    '<div class="pill-group"><button class="pill" id="du-cleanup">Clean Up</button></div><span class="am-src" id="du-src"></span></div>' +
    '<div class="du-wrap"><ul class="du-disks" id="du-disks"></ul><div class="du-main"><div class="am-h">Virtual Disks</div>' +
    '<div class="du-bar"><div id="du-fill"></div></div><div class="am-val du-info" id="du-info"></div>' +
    '<pre class="du-log" id="du-log"></pre></div></div>';
  var duDisks = [], duSel = 0, duLive = false;

  function duLoad() {
    getJSON('/cgi-bin/disks.cgi')
      .then(function (j) { duLive = true; duDisks = j.disks || []; })
      .catch(function () { duLive = false; duDisks = DU_SAMPLE.slice(); })
      .then(duRender);
  }
  function duRender() {
    var ul = $('du-disks'); ul.innerHTML = '';
    if (duSel >= duDisks.length) duSel = 0;
    duDisks.forEach(function (d, i) {
      var li = mk('li', i === duSel ? 'sel' : '');
      li.textContent = d.name;
      li.addEventListener('click', function () { duSel = i; duRender(); });
      ul.appendChild(li);
    });
    var d = duDisks[duSel];
    if (!d) { $('du-info').textContent = 'No disks reported.'; $('du-fill').style.width = '0%'; }
    else {
      var pct = d.total ? (d.used / d.total) * 100 : 0;
      $('du-fill').style.width = clamp(pct, 0, 100).toFixed(1) + '%';
      $('du-info').textContent = d.name + ' mounted at ' + d.mount + '\n' + fmtBytes(d.used) + ' used, ' + fmtBytes(d.total - d.used) + ' free of ' + fmtBytes(d.total) + ' (' + pct.toFixed(0) + '%)';
    }
    $('du-src').textContent = duLive ? 'Live data' : 'Sample data (no disk endpoint on this build)';
  }
  function duLog(t) { var l = $('du-log'); l.textContent += '[' + timeStamp() + '] ' + t + '\n'; l.scrollTop = l.scrollHeight; }
  function duAction(action) {
    var d = duDisks[duSel], label = DU_ACTIONS[action];
    if (!d) { duLog('No disk selected.'); return; }
    if (!duLive) { duLog(label + ' on ' + d.name + ' was not run. This build has no disk utility endpoint and is showing sample data.'); return; }
    if (action !== 'verify' && action !== 'perms' && !window.confirm(label + ' on ' + d.name + '?')) return;
    duLog(label + ' on ' + d.name + ' started.');
    fetch('/cgi-bin/diskutil.cgi?action=' + encodeURIComponent(action) + '&disk=' + encodeURIComponent(d.id), { method: 'POST', cache: 'no-store' })
      .then(parseReply)
      .then(function (r) { duLog(r.ok ? label + ' finished.\n' + (r.text || '').slice(0, 4000) : label + ' failed: ' + (r.text || 'error')); })
      .catch(function () { duLog(label + ' failed: no disk utility endpoint is reachable.'); });
  }

  // ---------- Desktop files ----------
  var deskLayer, deskMenu, deskMsg, deskItems = [], deskSel = null, menuPos = { x: 16, y: 40 };
  function deskLoad() { try { var v = JSON.parse(localStorage.getItem(DESK_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function deskSave() { try { localStorage.setItem(DESK_KEY, JSON.stringify(deskItems)); } catch (e) { /* storage unavailable */ } }
  function deskUid() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function deskMsgSet(t) { deskMsg.textContent = t || ''; }
  function gridSlot(i) { return { x: 16 + Math.floor(i / 6) * 96, y: 40 + (i % 6) * 100 }; }

  function deskRender() {
    deskLayer.querySelectorAll('.desk-icon').forEach(function (n) { n.parentNode.removeChild(n); });
    deskItems.forEach(function (it) {
      var el = mk('div', 'desk-icon ' + it.kind + (it.id === deskSel ? ' sel' : ''));
      el.setAttribute('data-id', it.id);
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      el.appendChild(mk('div', 'ico'));
      var lab = mk('div', 'label'); lab.textContent = it.name; el.appendChild(lab);
      deskBindIcon(el, it);
      deskLayer.insertBefore(el, deskMsg);
    });
  }
  function deskSelect(id) {
    deskSel = id;
    deskLayer.querySelectorAll('.desk-icon').forEach(function (el) { el.classList.toggle('sel', el.getAttribute('data-id') === id); });
  }
  function deskBindIcon(el, it) {
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.stopPropagation(); hideMenu(); deskSelect(it.id);
      var s = scale(), sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, moved = false;
      function mv(ev) {
        var dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        it.x = clamp(ox + dx, 0, stageW() - 88); it.y = clamp(oy + dy, 22, stageH() - 96);
        el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      }
      function up() {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        if (moved) deskSave();
      }
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', function () { deskOpen(it); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); deskSelect(it.id); deskShowMenu(e, 'icon'); });
  }
  function deskOpen(it) {
    if (it.kind === 'folder') { openApp('finder-window'); RedStarApps.go(it.path, true); return; }
    if (isTextFile(it.path)) { openApp('notes-window'); RedStarApps.openFile(it.path); return; }
    openApp('finder-window'); RedStarApps.go(parentOf(it.path), true);
  }
  function deskAdd(data) {
    var slot = gridSlot(deskItems.length);
    var it = {
      id: deskUid(), kind: data.dir ? 'folder' : 'file', dir: !!data.dir, name: data.name, path: data.path,
      x: typeof data.x === 'number' ? data.x : slot.x, y: typeof data.y === 'number' ? data.y : slot.y
    };
    deskItems.push(it); deskSave(); deskRender(); deskSelect(it.id);
    return it;
  }
  function deskRemove(id) {
    deskItems = deskItems.filter(function (it) { return it.id !== id; });
    if (deskSel === id) deskSel = null;
    deskSave(); deskRender();
  }
  function deskCleanUp() {
    deskItems.forEach(function (it, i) { var s = gridSlot(i); it.x = s.x; it.y = s.y; });
    deskSave(); deskRender();
  }
  function deskPos(e) {
    var r = deskLayer.getBoundingClientRect(), s = scale();
    return { x: clamp((e.clientX - r.left) / s - 44, 0, stageW() - 88), y: clamp((e.clientY - r.top) / s - 20, 22, stageH() - 120) };
  }
  function deskNewText(pos) {
    var name = window.prompt('File name:', 'Untitled.txt');
    if (!name || !name.trim()) return;
    var n = name.trim();
    if (n.indexOf('/') >= 0) { deskMsgSet('File names cannot contain /.'); return; }
    if (!isTextFile(n)) n += '.txt';
    var path = join(DESK_DIR, n);
    fetch('/cgi-bin/fsops.cgi?action=upload&path=' + encodeURIComponent(path), { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: '', cache: 'no-store' })
      .then(parseReply)
      .then(function (r) {
        if (r.json && r.json.ok) { deskAdd({ name: n, path: path, x: pos.x, y: pos.y }); deskMsgSet('Created ' + n + ' on the Desktop.'); }
        else deskMsgSet('Could not create ' + n + ': ' + ((r.json && r.json.error) || 'HTTP ' + r.status));
      })
      .catch(function () { deskMsgSet('Could not create ' + n + '.'); });
  }
  function deskUploadFiles(files, pos) {
    Array.prototype.forEach.call(files, function (f, i) {
      if (f.size > 26214400) { deskMsgSet(f.name + ': too large (25 MB max)'); return; }
      var path = join(DESK_DIR, f.name);
      fetch('/cgi-bin/fsops.cgi?action=upload&path=' + encodeURIComponent(path), { method: 'POST', body: f, cache: 'no-store' })
        .then(parseReply)
        .then(function (r) {
          if (r.json && r.json.ok) { deskAdd({ name: f.name, path: path, x: pos.x + i * 16, y: pos.y + i * 16 }); deskMsgSet('Copied ' + f.name + ' to the Desktop.'); }
          else deskMsgSet('Could not copy ' + f.name + ': ' + ((r.json && r.json.error) || 'HTTP ' + r.status));
        })
        .catch(function () { deskMsgSet('Copy failed: ' + f.name); });
    });
  }
  function deskShowMenu(e, mode) {
    deskMenu.innerHTML = '';
    var r = deskLayer.getBoundingClientRect(), s = scale();
    var px = (e.clientX - r.left) / s, py = (e.clientY - r.top) / s;
    var items = mode === 'icon' ? [['Open', 'open'], ['Remove from Desktop', 'remove']] : [['New Text File', 'new'], ['Clean Up', 'cleanup'], ['Open Finder', 'finder']];
    menuPos = { x: clamp(px - 44, 0, stageW() - 88), y: clamp(py - 20, 22, stageH() - 120) };
    items.forEach(function (it) {
      var b = mk('button', '');
      b.textContent = it[0];
      b.addEventListener('click', function () { hideMenu(); deskMenuAct(it[1]); });
      deskMenu.appendChild(b);
    });
    deskMenu.style.left = clamp(px, 0, stageW() - 190) + 'px';
    deskMenu.style.top = clamp(py, 22, stageH() - 120) + 'px';
    deskMenu.style.display = 'block';
  }
  function deskMenuAct(a) {
    var it = null;
    deskItems.forEach(function (x) { if (x.id === deskSel) it = x; });
    if (a === 'open' && it) deskOpen(it);
    else if (a === 'remove' && it) deskRemove(it.id);
    else if (a === 'new') deskNewText(menuPos);
    else if (a === 'cleanup') deskCleanUp();
    else if (a === 'finder') openApp('finder-window');
  }
  function hideMenu() { deskMenu.style.display = 'none'; }
  function deskInit() {
    deskLayer = mk('div', 'desk-layer'); deskLayer.id = 'desk-layer';
    deskMsg = mk('div', 'desk-msg');
    deskLayer.appendChild(deskMsg);
    deskMenu = mk('div', 'desk-menu'); deskMenu.id = 'desk-menu';
    stage.insertBefore(deskLayer, stage.firstChild);
    stage.appendChild(deskMenu);
    deskItems = deskLoad(); deskRender();
    deskLayer.addEventListener('pointerdown', function (e) {
      if (e.target === deskLayer || e.target === deskMsg) deskSelect(null);
      hideMenu();
    });
    deskLayer.addEventListener('contextmenu', function (e) { e.preventDefault(); deskSelect(null); deskShowMenu(e, 'desk'); });
    deskLayer.addEventListener('dragover', function (e) {
      var types = e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.types || []) : [];
      if (types.indexOf('application/x-hc-path') >= 0 || types.indexOf('Files') >= 0) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; deskLayer.classList.add('drop-over');
      }
    });
    deskLayer.addEventListener('dragleave', function (e) { if (e.target === deskLayer) deskLayer.classList.remove('drop-over'); });
    deskLayer.addEventListener('drop', function (e) {
      e.preventDefault(); deskLayer.classList.remove('drop-over');
      var dt = e.dataTransfer; if (!dt) return;
      var pos = deskPos(e);
      var hcPath = dt.getData('application/x-hc-path');
      if (hcPath) {
        var isDir = dt.getData('application/x-hc-dir') === '1';
        deskAdd({ name: baseOf(hcPath), path: hcPath, dir: isDir, x: pos.x, y: pos.y });
        deskMsgSet('Added ' + baseOf(hcPath) + ' to the Desktop.');
        return;
      }
      if (dt.files && dt.files.length) deskUploadFiles(dt.files, pos);
    });
    document.addEventListener('pointerdown', function (e) {
      if (deskMenu.style.display !== 'none' && !deskMenu.contains(e.target)) hideMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideMenu();
      var a = document.activeElement;
      var typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
      if ((e.key === 'Delete' || e.key === 'Backspace') && deskSel && !typing) deskRemove(deskSel);
    });
  }

  // Finder items become drag sources; dropping them on the Desktop creates a desktop icon for that path.
  function finderInit() {
    var main = $('fs-main'); if (!main) return;
    function mark() { main.querySelectorAll('.fs-item, .fs-row').forEach(function (el) { el.setAttribute('draggable', 'true'); }); }
    new MutationObserver(mark).observe(main, { childList: true, subtree: true });
    mark();
    main.addEventListener('dragstart', function (e) {
      var el = e.target.closest ? e.target.closest('.fs-item, .fs-row') : null;
      if (!el || !e.dataTransfer) return;
      var name, isDir;
      if (el.classList.contains('fs-item')) { name = el.querySelector('.fs-name').textContent; isDir = el.classList.contains('dir'); }
      else { name = el.children[0].textContent; isDir = el.children[1].textContent === '--'; }
      var path = join($('fs-path').textContent, name);
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('application/x-hc-path', path);
      e.dataTransfer.setData('application/x-hc-dir', isDir ? '1' : '0');
      e.dataTransfer.setData('text/plain', path);
    });
  }

  // ---------- Applications menu ----------
  var APP_LIST = [
    ['Finder', 'finder-window'], ['Terminal', 'konsol-window'], ['TextEdit', 'notes-window'],
    ['Activity Monitor', 'activity-window'], ['Disk Utility', 'diskutil-window'], ['PBook', 'messenger-window'],
    ['Progressbar', 'game-window'], ['Calculator', 'calc-window'], ['Settings', 'settings-window'], ['Trash', 'trash-window']
  ];
  function menuInit() {
    var trigger = $('menu-apps'); if (!trigger) return;
    var panel = mk('div', 'app-menu'); panel.id = 'app-menu';
    APP_LIST.forEach(function (a) {
      var b = mk('button', '');
      b.textContent = a[0];
      b.addEventListener('click', function () { panel.style.display = 'none'; trigger.classList.remove('open'); openApp(a[1]); });
      panel.appendChild(b);
    });
    stage.appendChild(panel);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.style.display !== 'block';
      panel.style.display = open ? 'block' : 'none';
      trigger.classList.toggle('open', open);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!panel.contains(e.target) && e.target !== trigger) { panel.style.display = 'none'; trigger.classList.remove('open'); }
    });
  }

  // ---------- Boot ----------
  makeWindow('activity-window', 'Activity Monitor', AM_BODY, { left: 120, top: 90, width: 640, height: 460 });
  makeWindow('diskutil-window', 'Disk Utility', DU_BODY, { left: 160, top: 120, width: 640, height: 440 });
  $('am-quit').addEventListener('click', amQuit);
  ['verify', 'repair', 'perms', 'repair-perms', 'cleanup'].forEach(function (a) {
    var id = 'du-' + a;
    var key = a === 'verify' ? 'verify' : a;
    $(id).addEventListener('click', function () { duAction(key); });
  });
  $('du-log').textContent = 'Select a disk and choose an action.\n';
  ['activity-window', 'diskutil-window'].forEach(function (id) {
    var d = document.querySelector('[data-app="' + id + '"]');
    if (d) d.addEventListener('click', function () { openApp(id); });
  });
  deskInit();
  finderInit();
  menuInit();
})();
