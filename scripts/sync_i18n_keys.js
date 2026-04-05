#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const messagesDir = path.resolve(process.cwd(), 'messages');
function readJson(file){
  return JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf8'));
}
function flatten(obj, prefix=''){
  const res = {};
  if (typeof obj !== 'object' || obj === null) {
    if (prefix) res[prefix] = obj;
    return res;
  }
  for (const key of Object.keys(obj)){
    const val = obj[key];
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(res, flatten(val, newPrefix));
    } else {
      res[newPrefix] = val;
    }
  }
  return res;
}

function unflatten(flat){
  const res = {};
  for (const k of Object.keys(flat)){
    const parts = k.split('.');
    let cur = res;
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      if (i === parts.length-1) {
        cur[p] = flat[k];
      } else {
        if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
        cur = cur[p];
      }
    }
  }
  return res;
}

if (!fs.existsSync(messagesDir)){
  console.error('messages directory not found at', messagesDir);
  process.exit(2);
}

const files = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No messages files found in', messagesDir);
  process.exit(2);
}

const data = {};
const flatData = {};
for (const file of files){
  try {
    const parsed = readJson(file);
    data[file] = parsed;
    flatData[file] = flatten(parsed, '');
  } catch (e) {
    console.error('Failed to parse', file, e.message);
    process.exit(2);
  }
}

const allKeys = new Set();
Object.values(flatData).forEach(fd => Object.keys(fd).forEach(k => allKeys.add(k)));

const enFile = files.find(f => f === 'en.json' || f.startsWith('en'));
const enFlat = enFile ? flatData[enFile] : {};

let changedFiles = [];
for (const file of files) {
  const fd = flatData[file];
  const missing = [];
  for (const k of allKeys) {
    if (!Object.prototype.hasOwnProperty.call(fd, k)) missing.push(k);
  }
  if (missing.length > 0) {
    console.log(`Adding ${missing.length} missing keys to ${file}`);
    for (const k of missing) {
      fd[k] = enFlat[k] !== undefined ? enFlat[k] : '';
    }
    const newObj = unflatten(fd);
    fs.writeFileSync(path.join(messagesDir, file), JSON.stringify(newObj, null, 2) + '\n', 'utf8');
    changedFiles.push(file);
  } else {
    console.log(`${file} ok`);
  }
}

if (changedFiles.length > 0) {
  console.log('Updated files:', changedFiles.join(', '));
  process.exit(0);
} else {
  console.log('All locale files already contain the same set of keys.');
  process.exit(0);
}
