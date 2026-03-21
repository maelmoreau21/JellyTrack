// Check TCP connection to host:port
const net = require('net');
const host = process.argv[2] || '127.0.0.1';
const port = parseInt(process.argv[3] || '3000', 10);

const socket = new net.Socket();
let connected = false;

socket.setTimeout(5000);

socket.on('connect', () => {
  connected = true;
  console.log(`CONNECTED to ${host}:${port}`);
  socket.end();
});

socket.on('timeout', () => {
  console.error('TIMEOUT');
  socket.destroy();
  process.exit(2);
});

socket.on('error', (err) => {
  console.error('ERROR', err && err.code ? err.code : err.message || err);
  process.exit(2);
});

socket.on('close', (hadError) => {
  if (!connected) {
    console.error('CLOSED without connection');
    process.exit(2);
  } else {
    process.exit(0);
  }
});

socket.connect(port, host);
