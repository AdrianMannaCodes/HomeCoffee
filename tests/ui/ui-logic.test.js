// Pure UI logic tests for ui/aqua/display.js and ui/home/room.js.
// The sandbox JS runtime cannot load modules, so the runner inlines both files (see tests/ui/run.js).
var D = DISPLAY;
var R = ROOM;
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error('fail: ' + msg); }
eq(D.ratioOf(1024, 768), '4:3'); eq(D.ratioOf(1920, 1080), '16:9'); eq(D.ratioOf(1680, 1050), '8:5');
eq(D.bestPreset({ width: 1024, height: 768 }), 'ipad8');
eq(D.bestPreset({ width: 1920, height: 1080 }), 'mac169');
eq(D.bestPreset({ width: 1680, height: 1050 }), 'mac1610');
var L = D.computeLayout({ width: 1024, height: 768 }, D.PRESETS.ipad8, { devicePixelRatio: 2 });
eq(L.scale, 1); eq(L.offsetX, 0); eq(L.backingWidth, 2048);
var F = D.computeLayout({ width: 1920, height: 1080 }, D.PRESETS.ipad8, { mode: 'fit' });
ok(F.cssWidth <= 1920 && F.cssHeight <= 1080, 'fit inside viewport');
ok(F.offsetX >= 0 && F.offsetY >= 0, 'offsets non-negative');
var Fi = D.computeLayout({ width: 1920, height: 1080 }, D.PRESETS.ipad8, { mode: 'fill' });
ok(Fi.cssWidth >= 1920 && Fi.cssHeight >= 1080, 'fill covers viewport');
eq(R.parseRoomAddress('192.168.1.20:7420 4821'), { ok: true, host: '192.168.1.20', port: 7420, pin: '4821' });
eq(R.parseRoomAddress('10.0.0.5:9000/0099').pin, '0099');
ok(R.parseRoomAddress('10.0.0.5').ok === false, 'missing port');
ok(R.parseRoomAddress('10.0.0.5:70000 1234').ok === false, 'port range');
ok(R.validPin('0042') && !R.validPin('42') && !R.validPin('12345'), 'pin checks');
var s = R.createRoomState();
eq(s.port, 7420);
s = R.setMode(s, 'host'); eq(s.mode, 'host');
s = R.addPeer(s, 'ann'); s = R.addPeer(s, 'ann'); eq(s.peers, ['ann'], 'no duplicate peers');
s = R.removePeer(s, 'ann'); eq(s.peers, []);
s = R.addSharedFile(s, { name: 'notes.txt', size: 12 }); eq(s.files[0].name, 'notes.txt');
s = R.addMessage(s, 'bo', 'hi'); eq(s.messages[0], { from: 'bo', body: 'hi', at: null });
ok(R.addMessage(s, 'bo', '') === s, 'empty message ignored');
console.log('ui logic tests passed');
