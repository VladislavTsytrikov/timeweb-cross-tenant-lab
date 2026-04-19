const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const tls = require('tls');
const crypto = require('crypto');

const MODE = process.env.MODE || 'scanner';
const CANARY_ID = process.env.CANARY_ID || `canary-${crypto.randomBytes(4).toString('hex')}`;
const CANARY_SECRET = process.env.CANARY_SECRET || crypto.randomBytes(12).toString('hex');
const CANARY_TOKEN = process.env.CANARY_TOKEN || crypto.randomBytes(8).toString('hex');

const SCAN_MAX_HOST = Number(process.env.SCAN_MAX_HOST || 15);
const SCAN_DELAY_MS = Number(process.env.SCAN_DELAY_MS || 80);
const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 1200);
const ACTION_TARGET_IP = process.env.ACTION_TARGET_IP || '';
const ACTION_TARGET_HOST = process.env.ACTION_TARGET_HOST || '';
const ACTION_PATH = process.env.ACTION_PATH || '/';
const ACTION_PROTOCOL = process.env.ACTION_PROTOCOL || 'https';
const ACTION_PORT = Number(process.env.ACTION_PORT || (ACTION_PROTOCOL === 'http' ? 80 : 443));

let canaryState = false;
let CACHE = {
  status: MODE === 'scanner' ? 'scanning' : 'canary-ready',
  mode: MODE,
  ts: new Date().toISOString()
};
let ACTION_CACHE = {
  status: MODE === 'action' ? 'pending' : 'idle',
  mode: 'action',
  ts: new Date().toISOString()
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeDoneFactory(resolve) {
  let done = false;
  return value => {
    if (!done) {
      done = true;
      resolve(value);
    }
  };
}

function getSelfIps() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  Object.values(ifaces).forEach(list => {
    (list || []).forEach(addr => {
      if (addr.family === 'IPv4') ips.push(addr.address);
    });
  });
  return ips;
}

function tcpScan(ip, port) {
  return new Promise(resolve => {
    const done = safeDoneFactory(resolve);
    const socket = new net.Socket();
    socket.setTimeout(SCAN_TIMEOUT_MS);
    socket.on('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      done(false);
    });
    socket.on('error', () => done(false));
    socket.connect(port, ip);
  });
}

function fetchHttp(ip, port, path = '/') {
  return fetchHttpWithHost(ip, port, path, ip);
}

function fetchHttpWithHost(ip, port, path = '/', hostHeader = ip) {
  return new Promise(resolve => {
    const done = safeDoneFactory(resolve);
    const req = http.request(
      {
        hostname: ip,
        port,
        path,
        method: 'GET',
        timeout: SCAN_TIMEOUT_MS,
        headers: { Host: hostHeader, 'User-Agent': 'tw-ct-scanner/1.0' }
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          if (body.length < 600) body += chunk.toString();
        });
        res.on('end', () => {
          done({
            ip,
            port,
            path,
            host_header: hostHeader,
            protocol: 'http',
            code: res.statusCode,
            server: res.headers.server || '',
            location: res.headers.location || '',
            content_type: res.headers['content-type'] || '',
            body_sample: body.slice(0, 240)
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      done({ ip, port, path, host_header: hostHeader, protocol: 'http', error: 'timeout' });
    });
    req.on('error', err => done({ ip, port, path, host_header: hostHeader, protocol: 'http', error: err.message }));
    req.end();
  });
}

function fetchHttps(ip, port, path = '/') {
  return fetchHttpsWithHost(ip, port, path, ip, ip);
}

function fetchHttpsWithHost(ip, port, path = '/', hostHeader = ip, sni = hostHeader) {
  return new Promise(resolve => {
    const done = safeDoneFactory(resolve);
    const req = https.request(
      {
        hostname: ip,
        port,
        path,
        method: 'GET',
        timeout: SCAN_TIMEOUT_MS,
        rejectUnauthorized: false,
        servername: sni,
        headers: { Host: hostHeader, 'User-Agent': 'tw-ct-scanner/1.0' }
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          if (body.length < 600) body += chunk.toString();
        });
        res.on('end', () => {
          done({
            ip,
            port,
            path,
            host_header: hostHeader,
            sni,
            protocol: 'https',
            code: res.statusCode,
            server: res.headers.server || '',
            location: res.headers.location || '',
            content_type: res.headers['content-type'] || '',
            body_sample: body.slice(0, 240)
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      done({ ip, port, path, host_header: hostHeader, sni, protocol: 'https', error: 'timeout' });
    });
    req.on('error', err => done({ ip, port, path, host_header: hostHeader, sni, protocol: 'https', error: err.message }));
    req.end();
  });
}

function tlsProbe(ip, port = 443, sni = ip) {
  return new Promise(resolve => {
    const done = safeDoneFactory(resolve);
    const sock = tls.connect(
      {
        host: ip,
        port,
        servername: sni,
        rejectUnauthorized: false,
        timeout: SCAN_TIMEOUT_MS
      },
      () => {
        const cert = sock.getPeerCertificate(true) || {};
        sock.end();
        done({
          ip,
          port,
          protocol: 'tls',
          sni,
          subject_cn: cert.subject && cert.subject.CN ? cert.subject.CN : '',
          issuer_cn: cert.issuer && cert.issuer.CN ? cert.issuer.CN : '',
          san: cert.subjectaltname || '',
          valid_from: cert.valid_from || '',
          valid_to: cert.valid_to || ''
        });
      }
    );
    sock.on('timeout', () => {
      sock.destroy();
      done({ ip, port, protocol: 'tls', sni, error: 'timeout' });
    });
    sock.on('error', err => done({ ip, port, protocol: 'tls', sni, error: err.message }));
  });
}

async function runScanner() {
  const hostOverrides = (process.env.EXTRA_HOSTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const selfIps = getSelfIps();
  const results = {
    mode: 'scanner',
    ts: new Date().toISOString(),
    self: {
      hostname: os.hostname(),
      uid: process.getuid ? process.getuid() : null,
      ips: selfIps
    },
    open_ports: [],
    probes: [],
    controls: []
  };

  for (let i = 1; i <= SCAN_MAX_HOST; i += 1) {
    const ip = `172.17.0.${i}`;
    for (const port of [22, 80, 443, 3000]) {
      const isOpen = await tcpScan(ip, port);
      if (isOpen) {
        results.open_ports.push({ ip, port, status: 'OPEN' });

        if (!selfIps.includes(ip) && port === 80) {
          results.probes.push(await fetchHttp(ip, 80, '/'));
          results.probes.push(await fetchHttp(ip, 80, '/proof'));
          for (const hostHeader of hostOverrides) {
            results.probes.push(await fetchHttpWithHost(ip, 80, '/proof', hostHeader));
          }
        }
        if (!selfIps.includes(ip) && port === 3000) {
          results.probes.push(await fetchHttp(ip, 3000, '/'));
          results.probes.push(await fetchHttp(ip, 3000, '/proof'));
        }
        if (!selfIps.includes(ip) && port === 443) {
          results.probes.push(await fetchHttps(ip, 443, '/'));
          results.probes.push(await tlsProbe(ip, 443));
          for (const hostHeader of hostOverrides) {
            results.probes.push(await fetchHttpsWithHost(ip, 443, '/proof', hostHeader, hostHeader));
            results.probes.push(await tlsProbe(ip, 443, hostHeader));
          }
        }
      }
      await sleep(SCAN_DELAY_MS);
    }
  }

  // Negative control: non-existent host must not expose service.
  results.controls.push(await fetchHttp('172.17.0.250', 3000, '/proof'));

  CACHE = results;
  return results;
}

async function runAction() {
  const targetHost = ACTION_TARGET_HOST || ACTION_TARGET_IP;

  if (!ACTION_TARGET_IP) {
    ACTION_CACHE = {
      status: 'action-error',
      mode: 'action',
      ts: new Date().toISOString(),
      error: 'missing ACTION_TARGET_IP'
    };
    return ACTION_CACHE;
  }

  const result =
    ACTION_PROTOCOL === 'http'
      ? await fetchHttpWithHost(ACTION_TARGET_IP, ACTION_PORT, ACTION_PATH, targetHost)
      : await fetchHttpsWithHost(ACTION_TARGET_IP, ACTION_PORT, ACTION_PATH, targetHost, targetHost);

  ACTION_CACHE = {
    status: 'done',
    mode: 'action',
    ts: new Date().toISOString(),
    self: {
      hostname: os.hostname(),
      uid: process.getuid ? process.getuid() : null,
      ips: getSelfIps()
    },
    action: {
      target_ip: ACTION_TARGET_IP,
      target_host: targetHost,
      path: ACTION_PATH,
      protocol: ACTION_PROTOCOL,
      port: ACTION_PORT
    },
    result
  };

  return ACTION_CACHE;
}

function startCanary() {
  const payload = () => ({
    mode: 'canary',
    canary_id: CANARY_ID,
    secret: CANARY_SECRET,
    state: canaryState,
    hostname: os.hostname(),
    ips: getSelfIps(),
    ts: new Date().toISOString()
  });

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/flip')) {
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('token') === CANARY_TOKEN) {
        canaryState = !canaryState;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, state: canaryState, canary_id: CANARY_ID }));
        return;
      }
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'bad token' }));
      return;
    }

    if (req.url.startsWith('/proof')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload()));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'canary-up', canary_id: CANARY_ID }));
  });

  server.listen(3000, () => {
    console.log('Canary server on 3000');
    console.log(JSON.stringify(payload()));
  });
}

function startScanner() {
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/rescan')) {
      CACHE = { mode: 'scanner', status: 'rescanning', ts: new Date().toISOString() };
      runScanner().catch(err => {
        CACHE = { mode: 'scanner', status: 'scan-error', error: String(err), ts: new Date().toISOString() };
      });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'rescan-started' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(CACHE, null, 2));
  });

  server.listen(3000, () => {
    console.log('Scanner server on 3000');
    runScanner()
      .then(r => console.log(`Scan done: ${r.open_ports.length} open ports`))
      .catch(err => {
        CACHE = { mode: 'scanner', status: 'scan-error', error: String(err), ts: new Date().toISOString() };
      });
  });
}

function startAction() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/rerun')) {
      ACTION_CACHE = { status: 'rerunning', mode: 'action', ts: new Date().toISOString() };
      runAction().catch(err => {
        ACTION_CACHE = { status: 'action-error', mode: 'action', error: String(err), ts: new Date().toISOString() };
      });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'rerun-started' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ACTION_CACHE, null, 2));
  });

  server.listen(3000, () => {
    console.log('Action server on 3000');
    runAction().then(r => console.log(JSON.stringify(r))).catch(err => {
      ACTION_CACHE = { status: 'action-error', mode: 'action', error: String(err), ts: new Date().toISOString() };
    });
  });
}

if (MODE === 'canary') startCanary();
else if (MODE === 'action') startAction();
else startScanner();
