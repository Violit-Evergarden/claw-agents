const http = require('http');
const options = {
  hostname: '127.0.0.1',
  port: 4040,
  path: '/api/requests/http/airt_3Az5HMuCSIxMrbra6eQPXy13U7S',
  method: 'GET'
};
let data = '';
const req = http.request(options, res => {
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const obj = JSON.parse(data);
    const respRaw = Buffer.from(obj.response.raw, 'base64').toString('utf8');
    console.log('=== 完整响应 ===');
    console.log(respRaw);
    
    // 分离 header 和 body
    const parts = respRaw.split('\r\n\r\n');
    if (parts[1]) {
      console.log('\n=== 响应 Body ===');
      console.log(parts[1]);
      try {
        const parsed = JSON.parse(parts[1]);
        console.log('\n=== 解析后 ===');
        console.log(JSON.stringify(parsed, null, 2));
      } catch(e) {
        console.log('无法解析为JSON:', e.message);
      }
    }
  });
});
req.on('error', e => console.error(e));
req.end();
