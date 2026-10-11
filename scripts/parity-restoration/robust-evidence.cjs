// Windows scanners may briefly lock an existing QA report during atomic rename.
// Only evidence in docs is affected, in these test processes.
require('../final-audit/robust-writes.cjs');
const fs = require('fs'), path = require('path');
const rename = fs.renameSync;
const docs = path.resolve(__dirname, '../../docs') + path.sep;
fs.renameSync = function(source, destination) {
  if (typeof destination !== 'string' || !path.resolve(destination).startsWith(docs) || !/\.(json|png)$/.test(destination)) return rename.call(fs, source, destination);
  for (let attempt = 0; attempt < 15; attempt++) {
    try { return rename.call(fs, source, destination); }
    catch (error) {
      if (!['UNKNOWN', 'EBUSY', 'EACCES', 'EPERM'].includes(error.code) || attempt === 14) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(100 * (attempt + 1), 700));
    }
  }
};
