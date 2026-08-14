const fs = require('fs');
const http = require('http');

let proof = '{"marker":"BB_HOST_BLOCK_OPEN_V2","error":"proof_missing"}';
try {
  proof = fs.readFileSync('/app/d.json', 'utf8');
} catch (_) {}

http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(proof);
}).listen(3000, () => console.log('bounded proof ready'));
