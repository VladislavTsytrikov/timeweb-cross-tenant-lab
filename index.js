const fs = require('fs');
const http = require('http');

let body = JSON.stringify({ marker: 'BB_CACHE_READER_B', error: 'proof_missing' });
try {
  body = fs.readFileSync('/app/d.json', 'utf8');
} catch (_) {}

http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(body);
}).listen(3000, () => console.log('cache reader ready'));
