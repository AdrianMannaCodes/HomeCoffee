// Runner for tests/ui/ui-logic.test.js. Inlines ui/aqua/display.js and ui/home/room.js, then runs the tests. Run: js-exec tests/ui/run.js, then js-exec /tmp/ui-run.js
var fs = require('fs');
var root = '/workspace/user/projects/redstar-os/';
function strip(src) { return src.replace(/^'use strict';$/m, ''); }
var out = 'var DISPLAY = (function () { var module = {}; ' + strip(fs.readFileSync(root + 'ui/aqua/display.js', 'utf8')) + '\nreturn { PRESETS: PRESETS, computeLayout: computeLayout, ratioOf: ratioOf, bestPreset: bestPreset }; })();\n'
  + 'var ROOM = (function () { var module = {}; ' + strip(fs.readFileSync(root + 'ui/home/room.js', 'utf8')) + '\nreturn module.exports || RoomLogic; })();\n'
  + fs.readFileSync(root + 'tests/ui/ui-logic.test.js', 'utf8');
fs.writeFileSync('/tmp/ui-run.js', out);
