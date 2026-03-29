const http=require('http'),fs=require('fs');
let d='{}';try{d=fs.readFileSync('/app/d.json','utf8')}catch(e){}
http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'application/json'});r.end(d)}).listen(3000,()=>console.log('ok'));
