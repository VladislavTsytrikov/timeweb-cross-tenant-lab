const crypto = require('crypto');
const fs = require('fs');

const expected = Buffer.from('TWBB-A-20260814-4f3c9a8d');
const fileName = 'bb-canary-4f3c9a8d.txt';

function probeExact(root) {
  const path = `${root}/${fileName}`;
  try {
    const stat = fs.statSync(path);
    if (!stat.isFile() || stat.size !== expected.length) {
      return { present: true, matched: false, length: stat.size, read: false };
    }
    const value = fs.readFileSync(path);
    return {
      present: true,
      matched: value.equals(expected),
      length: value.length,
      read: true,
      sha256: crypto.createHash('sha256').update(value).digest('hex'),
    };
  } catch (error) {
    return { present: false, matched: false, length: 0, read: false, error: error.code || error.name };
  }
}

const result = {
  marker: 'BB_CACHE_READER_B',
  cacheId: 'tw-bb-cache-20260814-4f3c9a8d',
  shared: probeExact('/bb-shared'),
  control: probeExact('/bb-control'),
};

fs.writeFileSync('/app/d.json', `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
