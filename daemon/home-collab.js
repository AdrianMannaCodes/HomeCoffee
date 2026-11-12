// Home collab daemon (reference implementation, Node.js). Hosts a room reachable at IP:PORT with a 4-digit PIN.
// Connection address format: IP:PORT + 4-digit PIN, e.g. 192.168.1.20:7420 4821.
// Default port 7420/tcp, configurable with --port or HOME_COLLAB_PORT. Bind address via --bind or HOME_COLLAB_BIND.
// Protocol: newline-delimited JSON. Client sends {"type":"join","pin":"1234","name":"x"}; server replies {"type":"ok"} or {"type":"error","reason":...}.
// Security: PIN is 4 digits (10,000 values), so the daemon locks a source IP after 5 failed tries for 10 minutes.
// Messages are broadcast to joined peers only.
'use strict';
const net = require('net');
const crypto = require('crypto');

const DEFAULT_PORT = 7420;
const MAX_FAILS = 5, LOCK_MS = 10 * 60 * 1000;

function randomPin() {
  // uniform 0000-9999 without modulo bias
  for (;;) {
    const n = crypto.randomBytes(2).readUInt16BE(0);
    if (n < 10000) return String(n).padStart(4, '0');
  }
}

// Parse "IP:PORT PIN" or "IP:PORT/PIN" or "IP:PORT" + separate PIN. Returns {host, port, pin} or throws.
function parseAddress(text) {
  const m = String(text).trim().match(/^(\[[0-9a-fA-F:]+\]|[^\s:\/]+):(\d{1,5})(?:[\s\/]+(\d{4}))?$/);
  if (!m) throw new Error('address must be IP:PORT with optional PIN, e.g. 192.168.1.20:7420 4821');
  const port = Number(m[2]);
  if (port < 1 || port > 65535) throw new Error('port out of range');
  return { host: m[1].replace(/^\[|\]$/g, ''), port, pin: m[3] || null };
}

// Format the connection string shown to users: "IP:PORT PIN".
function formatAddress(host, port, pin) {
  if (!/^\d{4}$/.test(String(pin))) throw new Error('PIN must be exactly 4 digits');
  const h = String(host).includes(':') ? `[${host}]` : host;
  return `${h}:${port} ${pin}`;
}

function createRoom(opts = {}) {
  const room = {
    pin: opts.pin || randomPin(),
    port: Number(opts.port || DEFAULT_PORT),
    peers: new Set(),
    fails: new Map(), // ip -> {count, lockedUntil}
    rotate(pin) { this.pin = pin || randomPin(); return this.pin; },
    address(host) { return formatAddress(host, this.port, this.pin); },
  };
  return room;
}

function pinMatches(given, actual) {
  const a = Buffer.from(String(given)), b = Buffer.from(String(actual));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createServer(room, log = () => {}) {
  return net.createServer((sock) => {
    const ip = sock.remoteAddress || 'unknown';
    let joined = false, buf = '';
    const send = (o) => sock.write(JSON.stringify(o) + '\n');
    const state = room.fails.get(ip) || { count: 0, lockedUntil: 0 };
    room.fails.set(ip, state);

    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
        let msg; try { msg = JSON.parse(line); } catch { send({ type: 'error', reason: 'bad-json' }); continue; }
        if (!joined) {
          if (msg.type !== 'join') { send({ type: 'error', reason: 'join-first' }); continue; }
          if (Date.now() < state.lockedUntil) { send({ type: 'error', reason: 'locked' }); sock.end(); return; }
          if (!/^\d{4}$/.test(String(msg.pin)) || !pinMatches(msg.pin, room.pin)) {
            state.count++;
            if (state.count >= MAX_FAILS) { state.lockedUntil = Date.now() + LOCK_MS; state.count = 0; }
            log('join-fail', ip);
            send({ type: 'error', reason: 'bad-pin' }); continue;
          }
          state.count = 0;
          joined = true; sock.name = String(msg.name || 'guest').slice(0, 32);
          room.peers.add(sock);
          send({ type: 'ok' });
          log('join', ip);
          continue;
        }
        if (msg.type === 'msg' && typeof msg.body === 'string' && msg.body.length <= 4096) {
          const out = JSON.stringify({ type: 'msg', from: sock.name, body: msg.body }) + '\n';
          for (const p of room.peers) if (p !== sock) p.write(out);
        }
      }
    });
    const drop = () => { if (joined) room.peers.delete(sock); };
    sock.on('close', drop); sock.on('error', drop);
  });
}

module.exports = { createRoom, createServer, randomPin, pinMatches, parseAddress, formatAddress, DEFAULT_PORT, MAX_FAILS, LOCK_MS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const port = Number(arg('--port', process.env.HOME_COLLAB_PORT || DEFAULT_PORT));
  const bind = arg('--bind', process.env.HOME_COLLAB_BIND || '0.0.0.0');
  const room = createRoom({ port });
  const srv = createServer(room, (ev, ip) => console.log(new Date().toISOString(), ev, ip));
  srv.listen(port, bind, () => console.log(`Home room ready. Connect with: ${room.address(bind === '0.0.0.0' ? '<your-ip>' : bind)}`));
}
