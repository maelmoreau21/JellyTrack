#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const messagesDir = path.join(process.cwd(), 'messages');
const locales = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'));
const keys = new Set();

locales.forEach(file => {
  const content = JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf8'));
  Object.keys(content).forEach(k => keys.add(k));
});

console.log('Collected i18n keys:', keys.size);