const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '..', 'messages');
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8'));
const fr = JSON.parse(fs.readFileSync(path.join(messagesDir, 'fr.json'), 'utf8'));

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const p = path.join(dir, file);
    const stat = fs.statSync(p);
    if (stat && stat.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) {
        results = results.concat(walk(p));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(p);
    }
  }
  return results;
}

const files = walk(path.join(__dirname, '..', 'src'));
console.log(`Checking ${files.length} ts/tsx files for translation keys...`);

const missing = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Find useTranslations('namespace') calls
  // e.g. const t = useTranslations('settings');
  // const ts = useTranslations('ssoSettings');
  // const t = await getTranslations('settings');
  const nsMatches = [...content.matchAll(/(?:useTranslations|getTranslations)\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g)];
  const namespaces = {};
  // default t -> first namespace or variable name
  const varNsMatches = [...content.matchAll(/const\s+([a-zA-Z0-9_]+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g)];
  for (const m of varNsMatches) {
    namespaces[m[1]] = m[2];
  }

  // Also check t('key') or ts('key') or whatever function call
  for (const [varName, ns] of Object.entries(namespaces)) {
    const keyRegex = new RegExp(`\\b${varName}\\(\\s*['"\`]([a-zA-Z0-9_.]+)['"\`]`, 'g');
    const keyMatches = [...content.matchAll(keyRegex)];
    for (const km of keyMatches) {
      const key = km[1];
      // check in en and fr
      const enNs = en[ns] || {};
      const frNs = fr[ns] || {};
      
      // key might have nested dots
      const parts = key.split('.');
      let enVal = enNs;
      let frVal = frNs;
      for (const p of parts) {
        enVal = enVal ? enVal[p] : undefined;
        frVal = frVal ? frVal[p] : undefined;
      }

      if (enVal === undefined) {
        missing.push({ file: path.relative(path.join(__dirname, '..'), file), varName, ns, key, lang: 'en' });
      }
      if (frVal === undefined) {
        missing.push({ file: path.relative(path.join(__dirname, '..'), file), varName, ns, key, lang: 'fr' });
      }
    }
  }
}

console.log(`Found ${missing.length} missing translation lookups:`);
for (const m of missing) {
  console.log(`[${m.lang}] ${m.file} -> ${m.ns}.${m.key}`);
}
