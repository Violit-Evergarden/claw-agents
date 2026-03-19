'use strict';

const https = require('https');
const dns = require('dns');

// DNS 解析测试
dns.resolve4('api.x.ai', (err, addresses) => {
  if (err) {
    console.log('DNS resolve FAILED:', err.message);
  } else {
    console.log('DNS resolved api.x.ai to:', addresses);
  }
});

// HTTPS 连接测试
const options = {
  hostname: 'api.x.ai',
  port: 443,
  path: '/v1/models',
  method: 'GET',
  headers: { 'Authorization': 'Bearer xai-test' },
  timeout: 8000,
};

console.log('Testing HTTPS connection to api.x.ai:443...');
const req = https.request(options, (res) => {
  console.log('HTTP Status:', res.statusCode);
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response (first 200):', data.substring(0, 200)));
});

req.on('timeout', () => {
  console.log('TIMEOUT: Connection to api.x.ai timed out after 8s');
  req.destroy();
});

req.on('error', (e) => {
  console.log('ERROR:', e.code, '-', e.message);
});

req.end();

// 同时测试 deepseek 确认本机网络正常
const options2 = {
  hostname: 'api.deepseek.com',
  port: 443,
  path: '/',
  method: 'GET',
  timeout: 8000,
};

console.log('Testing HTTPS connection to api.deepseek.com (control)...');
const req2 = https.request(options2, (res) => {
  console.log('DeepSeek HTTP Status:', res.statusCode);
});
req2.on('timeout', () => { console.log('DeepSeek TIMEOUT'); req2.destroy(); });
req2.on('error', (e) => { console.log('DeepSeek ERROR:', e.code, '-', e.message); });
req2.end();
