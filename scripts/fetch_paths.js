import http from 'http';
const paths = ["/", "/login", "/settings", "/settings/overview", "/settings/plugin", "/media/analysis", "/media/all"];
function fetchPath(path){
  const url = `http://localhost:3000${path}`;
  http.get(url, res => {
    console.log(path, 'STATUS', res.statusCode);
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('---', path, 'BODY START ---');
      console.log(data.slice(0,20000));
      console.log('---', path, 'BODY END ---\n\n');
    });
  }).on('error', err => {
    console.error('ERR', path, err.code || err.message);
  });
}
(async ()=>{
  for(const p of paths){
    await new Promise(r => setTimeout(r, 500));
    fetchPath(p);
  }
  setTimeout(()=>process.exit(0), 5000);
})();
