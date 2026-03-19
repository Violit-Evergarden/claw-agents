const http = require('http');

const body = JSON.stringify({
  op: 13,
  d: {
    plain_token: 'TestToken1234567890',
    event_ts: String(Math.floor(Date.now() / 1000))
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhook/qq/0',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Bot-Appid': '1903486211'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    try {
      const json = JSON.parse(data);
      console.log('plain_token:', json.plain_token);
      console.log('signature:', json.signature);
      console.log('sig length:', json.signature ? json.signature.length : 'N/A');
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
