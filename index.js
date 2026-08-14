const http = require('http');

const body = JSON.stringify({ marker: 'BB_CACHE_WRITER_A_RUNTIME' });

http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(body);
}).listen(3000, () => console.log('cache writer ready'));
