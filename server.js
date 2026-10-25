const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function lanIPs() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) found.push(net.address);
    }
  }
  return found;
}

function handler(req, res) {
  let rel;
  try {
    rel = decodeURIComponent(req.url.split('?')[0]);
  } catch (err) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/favicon.ico') rel = '/favicon.svg';
  if (rel.includes('\0')) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }

  const file = path.resolve(root, '.' + rel);
  const inside = file === root || file.startsWith(root + path.sep);
  const type = types[path.extname(file).toLowerCase()];
  if (!inside || !type) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('找不到');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('找不到');
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

function start(port) {
  const server = http.createServer(handler);
  server.on('error', (err) => {
    if (port === 80) {
      console.log('port 80 沒開起來（' + err.code + '）。請用下面的 :8080 網址。');
      return;
    }
    console.error('port ' + port + ' 失敗: ' + err.message);
    process.exit(1);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(port === 80 ? '  http://localhost/' : '  http://localhost:' + port + '/');
    if (port === 8080) {
      for (const ip of lanIPs()) console.log('  http://' + ip + ':' + port + '/');
      console.log('  http://corgihere.ddns.net:' + port + '/');
    }
    if (port === 80) console.log('  http://corgihere.ddns.net/');
  });
}

console.log('');
console.log('  corgihere 行事曆');
start(8080);
start(80);
