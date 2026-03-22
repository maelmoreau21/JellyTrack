// Simple fetch helper to GET a URL and print status, headers and a body snippet.
// Usage: node scripts/fetch_media.js [url]

const url = process.argv[2] || 'http://localhost:3000/media';

(async () => {
  try {
    const res = await fetch(url);
    console.log('URL:', url);
    console.log('STATUS:', res.status, res.statusText);
    const headersObj = {};
    for (const [k, v] of res.headers) headersObj[k] = v;
    console.log('HEADERS:', JSON.stringify(headersObj, null, 2));
    const text = await res.text();
    console.log('BODY_LENGTH:', text.length);
    console.log('\n---- BODY START (first 2000 chars) ----\n');
    console.log(text.slice(0, 2000));
    if (text.length > 2000) console.log('\n---- (truncated) ----\n');
    } catch (err) {
    try {
      console.error('FETCH_ERROR name:', err.name);
      console.error('FETCH_ERROR code:', err.code);
      console.error('FETCH_ERROR message:', err.message);
      console.error('FETCH_ERROR stack:', err.stack);
      try { console.error('FETCH_ERROR raw:', JSON.stringify(err)); } catch {}
    } catch {
      console.error('FETCH_ERROR (unknown):', err);
    }
    process.exit(2);
  }
})();
