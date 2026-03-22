/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function flatten(obj, prefix = '') {
  const res = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(res, flatten(val, newKey));
    } else {
      res[newKey] = val;
    }
  }
  return res;
}

function analyze(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.includes('en.json')) {
    console.error('No en.json in', dir);
    return;
  }
  const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
  const flatEn = flatten(en);
  const total = Object.keys(flatEn).length;
  const report = {};
  for (const file of files) {
    if (file === 'en.json') continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const flat = flatten(data);
    let identical = 0;
    let empty = 0;
    const identicalKeys = [];
    for (const k of Object.keys(flatEn)) {
      const vEn = String(flatEn[k] ?? '');
      const vLoc = flat[k] === undefined || flat[k] === null ? '' : String(flat[k]);
      if (vLoc === '') empty++;
      if (vLoc === vEn) { identical++; identicalKeys.push(k); }
    }
    report[file] = { total, identical, empty, identicalKeys, identicalPct: ((identical/total)*100).toFixed(2) };
  }
  return report;
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node check-untranslated.js <dir>'); process.exit(1); }
  console.log(JSON.stringify(analyze(dir), null, 2));
}
