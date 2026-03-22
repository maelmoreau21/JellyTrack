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

function unflatten(flat) {
  const res = {};
  for (const k of Object.keys(flat)) {
    const parts = k.split('.');
    let cur = res;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = flat[k];
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    }
  }
  return res;
}

function processDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.includes('en.json')) {
    console.error('No en.json found in', dir);
    return;
  }
  const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
  const flatEn = flatten(en);
  const results = {};
  for (const file of files) {
    if (file === 'en.json') continue;
    if (file === 'verification_full.json') continue;
    const fullPath = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const flat = flatten(data);
    const missing = [];
    const extra = [];
    for (const k of Object.keys(flatEn)) {
      if (!(k in flat)) missing.push(k);
    }
    for (const k of Object.keys(flat)) {
      if (!(k in flatEn)) extra.push(k);
    }
    // Sync: add missing keys copying from en
    let changed = false;
    for (const k of missing) {
      flat[k] = flatEn[k];
      changed = true;
    }
    // Remove extra keys
    for (const k of extra) {
      delete flat[k];
      changed = true;
    }
    if (changed) {
      const newObj = unflatten(flat);
      fs.writeFileSync(fullPath, JSON.stringify(newObj, null, 2) + '\n', 'utf8');
    }
    results[file] = { missingCount: missing.length, extraCount: extra.length, missing, extra };
  }
  return results;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node sync-translations.js <messages-dir>');
    process.exit(1);
  }
  const res = processDir(target);
  console.log(JSON.stringify(res, null, 2));
}
