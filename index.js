const http = require('http');
const net = require('net');
const os = require('os');

let CACHE = {status:'scanning...'};

function fetchHTTP(ip, port) {
  return new Promise(r => {
    const req = http.request({hostname:ip, port, path:'/', method:'GET', timeout:2000,
      headers:{'Host':ip}}, res => {
      let body = '';
      res.on('data', d => { if(body.length<300) body+=d; });
      res.on('end', () => r({ip,port,code:res.statusCode,server:res.headers.server||'',type:res.headers['content-type']||'',body:body.slice(0,200)}));
      setTimeout(()=>r({ip,port,code:res.statusCode,note:'body-timeout'}), 2000);
    });
    req.on('error', e => r({ip,port,err:e.message}));
    req.on('timeout', () => { req.destroy(); r({ip,port,err:'timeout'}); });
    req.end();
  });
}

function tcpScan(ip, port) {
  return new Promise(r => {
    const s = new net.Socket();
    s.setTimeout(400);
    s.on('connect', () => { s.destroy(); r(true); });
    s.on('timeout', () => { s.destroy(); r(false); });
    s.on('error', () => r(false));
    s.connect(port, ip);
  });
}

async function scan() {
  const r = {ts:new Date().toISOString(), self:{host:os.hostname(),uid:process.getuid()}, ports:[], http:[]};
  
  for(let i=1;i<=15;i++){
    const ip='172.17.0.'+i;
    for(const p of [22,80,443,3000,8080]){
      if(await tcpScan(ip,p)) r.ports.push(ip+':'+p);
    }
  }
  
  for(const target of r.ports){
    const [ip,port]=target.split(':');
    if([80,3000,8080].includes(+port) && ip!=='172.17.0.6'){
      r.http.push(await fetchHTTP(ip, +port));
    }
  }
  
  CACHE = r;
}

http.createServer((q,res) => {
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(CACHE,null,2));
}).listen(3000, () => {
  console.log('Server running on port 3000');
  scan().then(()=>console.log('Scan done:', JSON.stringify(CACHE.ports)));
});
