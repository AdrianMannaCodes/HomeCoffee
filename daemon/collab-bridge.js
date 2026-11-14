// Collab bridge: HTTP relay that lets the Aqua Messenger (browser) talk to daemon/home-collab.js over TCP.
// Endpoints (JSON): POST /join {host,port,pin,name} -> {session}; POST /send {session,body}; GET /poll?session=ID; POST /leave {session}.
// Binds 127.0.0.1 by default. Targets are loopback only unless COLLAB_ALLOW_LAN=1.
'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const PORT = Number(process.env.COLLAB_BRIDGE_PORT || 7421);
const BIND = process.env.COLLAB_BRIDGE_BIND || '127.0.0.1';
const ALLOW_LAN = process.env.COLLAB_ALLOW_LAN === '1';
const IDLE_MS = 5 * 60 * 1000;
const MAX_BUF = 200;
const MAX_FAILS = 4, LOCK_MS = 10 * 60 * 1000; // stays below the daemon's own limit of 5
let bridgeFails = 0, bridgeLockedUntil = 0;
const sessions = new Map(); // id -> {sock, buf, inbox[], lastSeen, closed}

function allowedHost(h) {
  if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
  return ALLOW_LAN && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj) + '\n');
}

function readBody(req, cb) {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 16384) req.destroy(); });
  req.on('end', () => { let o = {}; try { o = data ? JSON.parse(data) : {}; } catch (e) { return cb(null); } cb(o); });
}

function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  s.closed = true;
  try { s.sock.destroy(); } catch (e) { /* already closed */ }
  sessions.delete(id);
}

function join(req, res, o) {
  if (!o) return json(res, 400, { ok: false, error: 'bad-json' });
  const host = String(o.host || '127.0.0.1');
  const port = Number(o.port || 7420);
  const pin = String(o.pin || '');
  const name = String(o.name || 'guest').slice(0, 32);
  if (!allowedHost(host)) return json(res, 403, { ok: false, error: 'host-not-allowed' });
  if (!(port >= 1 && port <= 65535)) return json(res, 400, { ok: false, error: 'bad-port' });
  if (!/^\d{4}$/.test(pin)) return json(res, 400, { ok: false, error: 'pin-must-be-4-digits' });

  if (Date.now() < bridgeLockedUntil) return json(res, 429, { ok: false, error: 'locked', retryAfterMs: bridgeLockedUntil - Date.now() });
  const sock = net.connect(port, host);
  const id = crypto.randomBytes(12).toString('hex');
  const s = { sock, buf: '', inbox: [], lastSeen: Date.now(), closed: false, joined: false };
  let settled = false;
  const finish = (code, obj) => { if (!settled) { settled = true; json(res, code, obj); } };

  sock.setTimeout(10000, () => { finish(504, { ok: false, error: 'timeout' }); sock.destroy(); });
  sock.on('connect', () => sock.write(JSON.stringify({ type: 'join', pin, name }) + '\n'));
  sock.on('error', (e) => { finish(502, { ok: false, error: 'connect-failed', detail: e.code }); closeSession(id); });
  sock.on('close', () => { s.closed = true; if (!settled) finish(502, { ok: false, error: 'closed' }); sessions.delete(id); });
  sock.on('data', (chunk) => {
    s.buf += chunk.toString('utf8');
    let idx;
    while ((idx = s.buf.indexOf('\n')) >= 0) {
      const line = s.buf.slice(0, idx); s.buf = s.buf.slice(idx + 1);
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (!s.joined) {
        if (m.type === 'ok') { bridgeFails = 0; s.joined = true; sessions.set(id, s); sock.setTimeout(0); finish(200, { ok: true, session: id }); }
        else {
          if (m.reason === 'bad-pin') { bridgeFails++; if (bridgeFails >= MAX_FAILS) { bridgeLockedUntil = Date.now() + LOCK_MS; bridgeFails = 0; } }
          finish(m.reason === 'locked' ? 429 : 401, { ok: false, error: m.reason || 'rejected' }); sock.destroy();
        }
        continue;
      }
      if (m.type === 'msg') { s.inbox.push({ from: m.from || 'peer', body: m.body, at: Date.now() }); if (s.inbox.length > MAX_BUF) s.inbox.shift(); }
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && url.pathname === '/join') return readBody(req, (o) => join(req, res, o));

  if (req.method === 'POST' && url.pathname === '/send') return readBody(req, (o) => {
    const s = o && sessions.get(o.session);
    if (!s) return json(res, 404, { ok: false, error: 'no-session' });
    const body = String((o && o.body) || '');
    if (!body || body.length > 4096) return json(res, 400, { ok: false, error: 'body-must-be-1-to-4096-chars' });
    s.lastSeen = Date.now();
    s.sock.write(JSON.stringify({ type: 'msg', body }) + '\n');
    json(res, 200, { ok: true });
  });

  if (req.method === 'GET' && url.pathname === '/poll') {
    const s = sessions.get(url.searchParams.get('session'));
    if (!s) return json(res, 404, { ok: false, error: 'no-session' });
    s.lastSeen = Date.now();
    const msgs = s.inbox.splice(0, s.inbox.length);
    return json(res, 200, { ok: true, messages: msgs });
  }

  if (req.method === 'POST' && url.pathname === '/leave') return readBody(req, (o) => {
    closeSession(o && o.session);
    json(res, 200, { ok: true });
  });

  json(res, 404, { ok: false, error: 'not-found' });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastSeen > IDLE_MS) closeSession(id);
}, 30000).unref();

server.listen(PORT, BIND, () => console.log(`collab bridge on ${BIND}:${PORT} (lan targets: ${ALLOW_LAN})`));
module.exports = { allowedHost };
