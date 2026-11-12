// Checks lang/yezik/strings.json: Yezik-native values must avoid illegal letters; untranslated English fallbacks are exempt.
var fs = require('fs');
var j = JSON.parse(fs.readFileSync('/workspace/user/projects/redstar-os/lang/yezik/strings.json', 'utf8'));
var bad = [];
Object.keys(j.yezik).forEach(function (k) {
  if (j.yezik[k] === j.en[k]) return;
  if (/[rRäöžçŽÇÄÖ]/.test(j.yezik[k])) bad.push(k + '=' + j.yezik[k]);
});
console.log('illegal yezik strings:', JSON.stringify(bad));
