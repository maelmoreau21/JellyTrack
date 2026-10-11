// QA report writes can temporarily fail under Windows file scanning.
// Limit retries to JSON/PNG evidence under docs; leave application I/O untouched.
const fs = require('fs');
const path = require('path');
const write = fs.writeFileSync;
const asyncWrite = fs.promises.writeFile;
const root = path.resolve(__dirname, '../../docs') + path.sep;
let sequence = 0;
fs.writeFileSync = function(file, data, options) {
  if (typeof file !== 'string' || !path.resolve(file).startsWith(root) || !file.endsWith('.json')) return write.call(fs, file, data, options);
  for (let attempt = 0; attempt < 8; attempt++) {
    const temporary = file + '.qa-' + process.pid + '-' + sequence++;
    try {
      write.call(fs, temporary, data, options);
      fs.renameSync(temporary, file);
      return;
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch (_) {}
      if (!['UNKNOWN', 'EBUSY', 'EACCES', 'EPERM'].includes(error.code) || attempt === 7) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
};
fs.promises.writeFile = async function(file, data, options) {
  if (typeof file !== 'string' || !path.resolve(file).startsWith(root) || !/\.(png|json)$/.test(file)) return asyncWrite.call(fs.promises, file, data, options);
  for (let attempt = 0; attempt < 8; attempt++) {
    const temporary = file + '.qa-' + process.pid + '-' + sequence++;
    try {
      await asyncWrite.call(fs.promises, temporary, data, options);
      await fs.promises.rename(temporary, file);
      return;
    } catch (error) {
      try { await fs.promises.unlink(temporary); } catch (_) {}
      if (!['UNKNOWN', 'EBUSY', 'EACCES', 'EPERM'].includes(error.code) || attempt === 7) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
};
