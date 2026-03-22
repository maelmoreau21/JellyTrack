const http = require('http');
function fetchPort(port){
  const url = `http://localhost:${port}/`;
  http.get(url, res => {
    console.log('PORT', port, 'STATUS', res.statusCode);
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('BODY_START---');
      console.log(data.slice(0,20000));
      console.log('---BODY_END');
    });
  }).on('error', err => {
    console.error('ERR', port, err.code || err.message);
  });
}
fetchPort(3000);
setTimeout(()=>fetchPort(3001), 1500);
setTimeout(()=>process.exit(0), 5000);
