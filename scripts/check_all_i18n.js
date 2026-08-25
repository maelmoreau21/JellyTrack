const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'messages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('verification'));

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(getKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const fileData = {};
for (const f of files) {
  fileData[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

const enKeys = new Set(getKeys(fileData['en.json']));
const frKeys = new Set(getKeys(fileData['fr.json']));

console.log('=== EN vs FR ===');
console.log('Keys in EN but not in FR:');
for (const k of enKeys) {
  if (!frKeys.has(k)) console.log('  missing in FR:', k);
}
console.log('\nKeys in FR but not in EN:');
for (const k of frKeys) {
  if (!enKeys.has(k)) console.log('  extra in FR:', k);
}

console.log('\n=== ALL FILES vs EN ===');
for (const f of files) {
  if (f === 'en.json') continue;
  const kSet = new Set(getKeys(fileData[f]));
  const missing = [...enKeys].filter(k => !kSet.has(k));
  if (missing.length > 0) {
    console.log(`${f} is missing ${missing.length} keys:`);
    missing.slice(0, 10).forEach(k => console.log(`  - ${k}`));
    if (missing.length > 10) console.log(`  ... and ${missing.length - 10} more`);
  }
}
