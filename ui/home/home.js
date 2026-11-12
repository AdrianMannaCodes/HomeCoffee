// Home app controller: wires the DOM to room.js. Browser build.
// STATUS: the Connect button does NOT open a connection yet. A browser cannot open raw TCP to the daemon,
// so a WebSocket bridge is required. That bridge is NOT implemented in this repo, and Connect reports that honestly.
'use strict';
(function () {
  var lang = (new URLSearchParams(location.search).get('lang')) || 'en';
  var strings = null;
  function t(key) { var s = strings && strings[lang]; return (s && s[key]) || key; }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
  }
  var RL = window.RoomLogic;
  var state = RL.createRoomState();
  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { $('status').textContent = msg; }
  function render() {
    $('peers').innerHTML = '';
    if (!state.peers.length) $('peers').innerHTML = '<li>' + t('home.noPeers') + '</li>';
    state.peers.forEach(function (p) { var li = document.createElement('li'); li.textContent = p; $('peers').appendChild(li); });
    $('files').innerHTML = '';
    if (!state.files.length) $('files').innerHTML = '<li>' + t('home.noFiles') + '</li>';
    state.files.forEach(function (f) { var li = document.createElement('li'); li.textContent = f.name + ' (' + f.from + ')'; $('files').appendChild(li); });
    $('messages').innerHTML = '';
    state.messages.forEach(function (m) { var d = document.createElement('div'); d.textContent = m.from + ': ' + m.body; $('messages').appendChild(d); });
    $('tab-host').setAttribute('aria-selected', String(state.mode === 'host'));
    $('tab-join').setAttribute('aria-selected', String(state.mode === 'join'));
  }
  $('tab-host').onclick = function () { state = RL.setMode(state, 'host'); render(); };
  $('tab-join').onclick = function () { state = RL.setMode(state, 'join'); render(); };
  $('connect').onclick = function () {
    var parsed = RL.parseRoomAddress($('address').value + ' ' + $('pin').value);
    if (!parsed.ok || !RL.validPin(parsed.pin)) { setStatus(t('home.badAddress')); return; }
    setStatus('Not connected. The browser transport (WebSocket bridge to ' + parsed.host + ':' + parsed.port + ') is not implemented yet.');
  };
  $('chat-send').onclick = function () {
    var body = $('chat-input').value.trim();
    if (!body) return;
    state = RL.addMessage(state, 'you', body);
    $('chat-input').value = '';
    render();
  };
  $('switch-account').onclick = function () { setStatus('Account switching is not implemented yet.'); };
  setInterval(function () { var c = $('clock'); if (c) c.textContent = new Date().toLocaleTimeString(); }, 1000);
  fetch('../../lang/yezik/strings.json').then(function (r) { return r.json(); }).then(function (j) { strings = j; applyI18n(); render(); }).catch(function () { applyI18n(); render(); });
})();
