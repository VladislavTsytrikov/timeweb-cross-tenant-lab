const fs = require('fs');
const { spawnSync } = require('child_process');

const MARKER = 'BB_HOST_BLOCK_OPEN_V2';
const result = { marker: MARKER, hostMountFound: false, host: {}, control: {} };

function probeDevice(label, major, minor) {
  const path = `/tmp/bb-${label}-device`;
  try { fs.unlinkSync(path); } catch (_) {}

  const made = spawnSync('mknod', ['-m', '600', path, 'b', String(major), String(minor)], {
    encoding: 'utf8',
    timeout: 5000,
  });
  const out = {
    majorMinor: `${major}:${minor}`,
    mknodExit: made.status,
    mknodError: made.error ? made.error.code || made.error.name : null,
    open: 'not_attempted',
    openErrno: null,
  };

  if (made.status === 0) {
    try {
      const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      fs.closeSync(fd);
      out.open = 'success';
    } catch (error) {
      out.open = 'denied';
      out.openErrno = error.code || error.name;
    }
  }

  try { fs.unlinkSync(path); } catch (_) {}
  return out;
}

const mountLine = fs.readFileSync('/proc/self/mountinfo', 'utf8')
  .split('\n')
  .find((line) => line.split(' ')[4] === '/etc/hosts');

if (mountLine) {
  const majorMinor = mountLine.split(' ')[2];
  const [major, minor] = majorMinor.split(':').map(Number);
  if (Number.isInteger(major) && Number.isInteger(minor)) {
    result.hostMountFound = true;
    result.host = probeDevice('host', major, minor);
  }
}

result.control = probeDevice('control', 511, 511);
fs.writeFileSync('/app/d.json', `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
