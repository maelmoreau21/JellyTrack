/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '..', 'messages');
const canonicalFile = 'fr.json';
const namespace = 'media';

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('Failed to read', p, e.message);
    return null;
  }
}

const canonicalPath = path.join(messagesDir, canonicalFile);
const canonical = readJson(canonicalPath);
if (!canonical) process.exit(2);
const canonicalKeys = Object.keys(canonical[namespace] || {});

// Ignore generated verification/report files like verification_full.json
const files = fs.readdirSync(messagesDir)
  .filter(f => f.endsWith('.json') && !f.toLowerCase().includes('verification'));

console.log('Checking locale files:', files.join(', '));

let allOk = true;
for (const file of files) {
  const p = path.join(messagesDir, file);
  const data = readJson(p);
  if (!data) continue;
  const keys = Object.keys(data[namespace] || {});
  const missing = canonicalKeys.filter(k => !keys.includes(k));
  if (missing.length > 0) {
    allOk = false;
    console.log(`${file} is missing ${missing.length} keys in '${namespace}':`);
    missing.forEach(k => console.log('  -', k));
  }
}

if (allOk) {
  console.log('All locale files contain the canonical media keys.');
  process.exit(0);
} else {
  process.exit(1);
}
