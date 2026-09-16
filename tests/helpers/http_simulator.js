const { Readable, Writable } = require('node:stream');

function simulateRequest(server, { method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new Readable({
      read() {}
    });

    req.method = method.toUpperCase();
    req.url = path;
    const normalizedHeaders = { host: '127.0.0.1:3000' };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    req.headers = normalizedHeaders;

    const responseChunks = [];
    const resHeaders = {};

    const res = new Writable({
      write(chunk, encoding, callback) {
        responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      }
    });

    res.statusCode = 200;
    res.setHeader = (key, value) => {
      resHeaders[key.toLowerCase()] = value;
    };
    res.getHeader = (key) => resHeaders[key.toLowerCase()];
    res.writeHead = (statusCode, headers = {}) => {
      res.statusCode = statusCode;
      for (const [k, v] of Object.entries(headers)) {
        res.setHeader(k, v);
      }
    };

    res.end = (chunk) => {
      if (chunk) {
        responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(responseChunks).toString('utf-8');
      let json = null;
      try {
        json = JSON.parse(rawBody);
      } catch (e) {}

      resolve({
        statusCode: res.statusCode,
        headers: resHeaders,
        body: rawBody,
        json
      });
    };

    // Emit the request event to the server
    server.emit('request', req, res);

    if (body !== null && body !== undefined) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.push(Buffer.from(data));
    }
    req.push(null);
  });
}

module.exports = {
  simulateRequest
};
