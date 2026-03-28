const http = require('http');
const fs = require('fs');
let buildData = '{}';
try { buildData = fs.readFileSync('/app/build-data.json', 'utf8'); } catch(e) {}
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(buildData);
}).listen(3000, () => console.log('Serving build data on 3000'));
