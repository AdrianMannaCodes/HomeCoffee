// Yezik orthography and grammar validator, based on the Yezik rules. Usage: js-exec scripts/yezik-validate.js "text"
'use strict';
const ILLEGAL_LETTERS = { r: 'r does not exist in Yezik', R: 'R does not exist in Yezik', 'ä': 'ä is forbidden', 'ö': 'ö is forbidden', 'Ä': 'ä is forbidden', 'Ö': 'ö is forbidden', 'ž': 'ž is not a letter', 'Ž': 'ž is not a letter', 'ç': 'ç is not a letter', 'Ç': 'ç is not a letter' };
const PREFIXES = ['wi', 'vu', 'le', 'pü'];
const TENSE_SUFFIXES = ['ęd', 'em', 'al'];
const CASE_SUFFIXES = { nom: ['', 'ęs'], gen: ['as', 'asęs'], not: ['y', 'yęs'] };

function checkWord(w) {
  const errs = [];
  const lw = w.toLowerCase();
  for (const ch of w) if (ILLEGAL_LETTERS[ch]) errs.push(`${w}: ${ILLEGAL_LETTERS[ch]}`);
  if (/pü$/.test(lw) && lw.length > 2) errs.push(`${w}: pü is a prefix only`);
  if (/^wi/.test(lw) && /ęd$/.test(lw)) errs.push(`${w}: wi- future cannot combine with -ęd past`);
  return errs;
}
function validate(text) {
  const words = text.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.,!?;:"()]/g, ''));
  const errs = [];
  for (const w of words) errs.push(...checkWord(w));
  if (/(^|\s)go\s+tǐ($|\s)/i.test(text)) errs.push('"go tǐ" is forbidden, use "tu"');
  return { ok: errs.length === 0, errors: errs };
}
module.exports = { validate, checkWord, CASE_SUFFIXES, PREFIXES, TENSE_SUFFIXES };
