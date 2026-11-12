// Room-code logic for the Home app: host/join state, peer list, shared file list, chat. Pure logic, no DOM or sockets.
// Address format is IP:PORT plus 4-digit PIN (default port 7420), matching daemon/home-collab.js.
'use strict';
var RoomLogic = (function () {
  var DEFAULT_PORT = 7420;

  function parseRoomAddress(text) {
    var m = String(text || '').trim().match(/^(\[[0-9a-fA-F:]+\]|[^\s:\/]+):(\d{1,5})(?:[\s\/]+(\d{4}))?$/);
    if (!m) return { ok: false, error: 'Enter IP:PORT and a 4-digit PIN, for example 192.168.1.20:7420 4821.' };
    var port = Number(m[2]);
    if (port < 1 || port > 65535) return { ok: false, error: 'Port must be between 1 and 65535.' };
    return { ok: true, host: m[1].replace(/^\[|\]$/g, ''), port: port, pin: m[3] || null };
  }
  function validPin(pin) { return /^\d{4}$/.test(String(pin || '')); }
  function createRoomState() {
    return { mode: 'join', connected: false, host: null, port: DEFAULT_PORT, pin: null, peers: [], files: [], messages: [] };
  }
  function setMode(state, mode) {
    if (mode !== 'host' && mode !== 'join') throw new Error('mode must be host or join');
    return Object.assign({}, state, { mode: mode });
  }
  function addPeer(state, name) {
    var n = String(name || 'guest').slice(0, 32);
    if (state.peers.indexOf(n) >= 0) return state;
    return Object.assign({}, state, { peers: state.peers.concat([n]) });
  }
  function removePeer(state, name) {
    return Object.assign({}, state, { peers: state.peers.filter(function (p) { return p !== name; }) });
  }
  function addSharedFile(state, file) {
    if (!file || !file.name) return state;
    return Object.assign({}, state, { files: state.files.concat([{ name: String(file.name), size: Number(file.size) || 0, from: file.from || 'you' }]) });
  }
  function addMessage(state, from, body) {
    var text = String(body || '').slice(0, 4096);
    if (!text) return state;
    return Object.assign({}, state, { messages: state.messages.concat([{ from: String(from || 'guest'), body: text, at: null }]) });
  }
  return { parseRoomAddress: parseRoomAddress, validPin: validPin, createRoomState: createRoomState, setMode: setMode,
    addPeer: addPeer, removePeer: removePeer, addSharedFile: addSharedFile, addMessage: addMessage, DEFAULT_PORT: DEFAULT_PORT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RoomLogic;
if (typeof window !== 'undefined') window.RoomLogic = RoomLogic;
