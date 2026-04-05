// Usage: node scripts/check_translations.js
const fs = require('fs');
const path = require('path');

const messagesDir = path.resolve(__dirname, '..', 'messages');
if (!fs.existsSync(messagesDir)) {
  console.error('messages directory not found:', messagesDir);
  process.exit(1);
}

const files = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('No locale JSON files found in', messagesDir);
  process.exit(1);
}

function flatten(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

const dataByFile = {};
const keysByFile = {};

for (const f of files) {
  const full = path.join(messagesDir, f);
  let raw;
  try { raw = fs.readFileSync(full, 'utf8'); }
  catch (e) { console.error('Failed to read', f, e.message); process.exit(2); }
  let json;
  try { json = JSON.parse(raw); }
  catch (e) { console.error('Parse error for', f, e.message); process.exit(3); }
  dataByFile[f] = json;
  keysByFile[f] = new Set(Object.keys(flatten(json)));
}

const allKeys = new Set();
Object.values(keysByFile).forEach(s => s.forEach(k => allKeys.add(k)));

const enFile = files.find(x => x.startsWith('en')) || files[0];
const enFlat = flatten(dataByFile[enFile]);

console.log('Locales found:', files.join(', '));
console.log('Total distinct keys:', allKeys.size);

let anyMissing = false;
for (const f of files) {
  const missing = [...allKeys].filter(k => !keysByFile[f].has(k));
  if (missing.length > 0) {
    anyMissing = true;
    console.log(`\n${f} — missing ${missing.length} keys:`);
    missing.slice(0, 300).forEach(k => console.log('  -', k));
    if (missing.length > 300) console.log(`  ... (+${missing.length - 300} more)`);
  }
}

if (!anyMissing) console.log('\nAll locales contain the same set of keys.');

console.log('\nChecking empty or identical-to-en translations:');
for (const f of files) {
  if (f === enFile) continue;
  const flat = flatten(dataByFile[f]);
  const issues = [];
  for (const [k, enVal] of Object.entries(enFlat)) {
    const val = flat[k];
    if (val === '' || val === null || val === undefined) issues.push({ key: k, reason: 'empty' });
    else if (typeof enVal === 'string' && val === enVal) issues.push({ key: k, reason: 'same-as-en' });
  }
  if (issues.length) {
    console.log(`\n${f} — ${issues.length} potential issues:`);
    issues.slice(0, 300).forEach(it => console.log(`  - ${it.key} (${it.reason})`));
    if (issues.length > 300) console.log(`  ... (+${issues.length - 300} more)`);
  }
}

console.log('\nDone.');
