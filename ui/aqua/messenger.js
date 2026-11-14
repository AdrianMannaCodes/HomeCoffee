// Aqua Messenger: Home Collab client. Talks to the collab bridge (127.0.0.1:7421) which relays to daemon/home-collab.js.
(function () {
  'use strict';
  var BRIDGE_PORT = 7421, STORE_KEY = 'hc.msg.conn', POLL_MS = 2000;
  var session = null, pollTimer = null, nick = '';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function bridgeBase() { return 'http://' + (location.hostname || '127.0.0.1') + ':' + BRIDGE_PORT; }
  function setStatus(on, text) { var s = $('msg-status'); if (!s) return; s.textContent = text; s.className = 'msg-status ' + (on ? 'on' : 'off'); }
  function setError(text) { var e = $('msg-error'); if (e) e.textContent = text || ''; }

  // Turns plain text into safe HTML. URLs and fsops download links become clickable; everything else is escaped.
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+|\/cgi-bin\/fsops\.cgi\?[^\s<]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
    });
  }

  function addBubble(from, text, kind) {
    var log = $('msg-log'); if (!log) return;
    var d = document.createElement('div');
    d.className = 'bubble ' + kind;
    if (kind === 'system') d.textContent = text;
    else d.innerHTML = '<span class="who">' + esc(from) + '</span>' + linkify(text);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function showChat(on) {
    $('msg-connect').style.display = on ? 'none' : '';
    $('msg-chat').style.display = on ? '' : 'none';
  }

  function post(path, obj) {
    return fetch(bridgeBase() + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj), cache: 'no-store'
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); });
  }

  function connect() {
    var host = ($('msg-host').value || '').trim() || (location.hostname || '127.0.0.1');
    var port = parseInt($('msg-port').value, 10) || 7420;
    var pin = ($('msg-pin').value || '').trim();
    nick = ($('msg-nick').value || '').trim() || 'guest';
    if (!/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return; }
    setError('Connecting...');
    post('/join', { host: host, port: port, pin: pin, name: nick }).then(function (r) {
      if (!r.json.ok) { setError(explain(r.json.error)); return; }
      session = r.json.session;
      storeSet(STORE_KEY, JSON.stringify({ host: host, port: port, nick: nick }));
      setError('');
      setStatus(true, 'Connected to ' + host + ':' + port);
      showChat(true);
      addBubble('', 'Joined the room as ' + nick + '.', 'system');
      startPoll();
    }).catch(function () { setError('Could not reach the collab bridge on this device.'); });
  }

  function explain(code) {
    var map = {
      'bad-pin': 'Wrong PIN.', 'locked': 'Too many wrong PIN tries. Wait a few minutes.',
      'host-not-allowed': 'Only local or LAN addresses can be used.', 'connect-failed': 'No room answered at that address.',
      'timeout': 'The room did not respond in time.', 'pin-must-be-4-digits': 'PIN must be exactly 4 digits.'
    };
    return map[code] || ('Could not join (' + code + ').');
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(poll, POLL_MS);
  }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function poll() {
    if (!session) return;
    fetch(bridgeBase() + '/poll?session=' + encodeURIComponent(session), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { session = null; stopPoll(); setStatus(false, 'Disconnected'); addBubble('', 'Connection lost: ' + (j.error || 'unknown'), 'system'); showChat(false); return; }
        (j.messages || []).forEach(function (m) { addBubble(m.from, m.body, 'peer'); });
      })
      .catch(function () { /* bridge briefly unreachable; retry on next tick */ });
  }

  function send() {
    var box = $('msg-text');
    var text = (box.value || '').replace(/\s+$/, '');
    if (!text || !session) return;
    box.value = '';
    post('/send', { session: session, body: text }).then(function (r) {
      if (!r.json.ok) { addBubble('', 'Not sent: ' + (r.json.error || 'error'), 'system'); return; }
      addBubble(nick, text, 'me');
    }).catch(function () { addBubble('', 'Not sent: bridge unreachable.', 'system'); });
  }

  // File sharing: uploads to /root/Documents/Shared through fsops.cgi, then posts the download link into the room.
  var SHARE_DIR = '/root/Documents/Shared';
  function shareFiles(files) {
    if (!session) { setError('Connect first.'); return; }
    Array.prototype.forEach.call(files, function (f) {
      if (f.size > 26214400) { addBubble('', f.name + ' is too large (25 MB max).', 'system'); return; }
      var target = SHARE_DIR + '/' + f.name.replace(/[\/\\"]/g, '_');
      // Ensure the shared folder exists; ignore 409 (already there).
      fetch('/cgi-bin/fsops.cgi?action=mkdir&path=' + encodeURIComponent(SHARE_DIR), { method: 'POST', cache: 'no-store' })
        .then(function () {
          return fetch('/cgi-bin/fsops.cgi?action=upload&path=' + encodeURIComponent(target), { method: 'POST', body: f, cache: 'no-store' });
        })
        .then(function (r) { return r.text().then(function (txt) { var j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, json: j }; }); })
        .then(function (r) {
          if (r.status === 409) r = { status: 409, json: { ok: false, error: 'a file with that name already exists in Shared' } };
          if (!(r.json && r.json.ok)) { addBubble('', 'Could not share ' + f.name + ': ' + (r.json ? r.json.error : r.status), 'system'); return; }
          var link = '/cgi-bin/fsops.cgi?action=download&path=' + encodeURIComponent(target);
          var text = '[file] ' + f.name + ' ' + link;
          return post('/send', { session: session, body: text }).then(function (s) {
            if (s.json.ok) addBubble(nick, text, 'me');
            else addBubble('', 'File saved, but not sent to the room: ' + (s.json.error || 'error'), 'system');
          });
        })
        .catch(function () { addBubble('', 'Could not share ' + f.name + '.', 'system'); });
    });
  }

  function disconnect() {
    stopPoll();
    if (session) post('/leave', { session: session }).catch(function () {});
    session = null;
    setStatus(false, 'Not connected');
    showChat(false);
  }

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function init() {
    if (!$('messenger-window')) return;
    var saved = {}; try { saved = JSON.parse(storeGet(STORE_KEY) || '{}'); } catch (e) {}
    $('msg-host').value = saved.host || (location.hostname || '127.0.0.1');
    $('msg-port').value = saved.port || 7420;
    $('msg-nick').value = saved.nick || '';
    setStatus(false, 'Not connected');
    showChat(false);
    $('msg-connect-btn').onclick = connect;
    $('msg-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
    $('msg-send-btn').onclick = send;
    $('msg-text').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    $('msg-disconnect').onclick = disconnect;
    $('msg-clip').onclick = function () { $('msg-file').click(); };
    $('msg-file').addEventListener('change', function (e) { shareFiles(e.target.files); e.target.value = ''; });
    var chat = $('msg-chat');
    chat.addEventListener('dragover', function (e) { e.preventDefault(); chat.classList.add('drop'); });
    chat.addEventListener('dragleave', function () { chat.classList.remove('drop'); });
    chat.addEventListener('drop', function (e) { e.preventDefault(); chat.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files) shareFiles(e.dataTransfer.files); });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.RedStarMessenger = { connect: connect, disconnect: disconnect, shareFiles: shareFiles };
})();
