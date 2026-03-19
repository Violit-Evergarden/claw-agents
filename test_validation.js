'use strict';
const crypto = require('crypto');

function handleValidation(appSecret, d) {
  const { plain_token, event_ts } = d;
  let seed = appSecret;
  while (seed.length < 32) seed = seed + seed;
  seed = seed.slice(0, 32);
  const seedBuf = Buffer.from(seed, 'utf8');
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(event_ts + plain_token, 'utf8');
  const sigBuf = crypto.sign(null, msg, privateKey);
  return { plain_token, signature: sigBuf.toString('hex') };
}

// 模拟 QQ 平台发来的 op=13 请求
const mockD = {
  plain_token: 'Oq7RUgjSqaSJNiEoMXxX',
  event_ts: '1748000000',
};

console.log('=== Bot 0 (violet) ===');
const r0 = handleValidation('X0GJ8j6F9pIXcU8Y', mockD);
console.log('seed used:', 'X0GJ8j6F9pIXcU8Y'.repeat(3).slice(0, 32));
console.log('signature:', r0.signature);
console.log('sig length:', r0.signature.length, '(should be 128)');

console.log('\n=== Bot 1 (Christina) ===');
const r1 = handleValidation('AsbK4oZL7uhVJ8xndUME70uojeaWTRPO', mockD);
console.log('seed used:', 'AsbK4oZL7uhVJ8xndUME70uojeaWTRPO'.slice(0, 32));
console.log('signature:', r1.signature);
console.log('sig length:', r1.signature.length, '(should be 128)');

console.log('\n=== 诊断信息 ===');
console.log('Bot0 appSecret length:', 'X0GJ8j6F9pIXcU8Y'.length);
console.log('Bot1 appSecret length:', 'AsbK4oZL7uhVJ8xndUME70uojeaWTRPO'.length);

// 检查 express.json() 是否会修改 body（校验握手时 body 必须是原始内容）
// op=13 收到的是 { op: 13, d: { plain_token, event_ts } }
// express.json() 会自动解析，d 字段是对象，code 里用 body.d 获取是正确的
console.log('\n=== body.d 解构检查 ===');
const rawBody = '{"op":13,"d":{"plain_token":"Oq7RUgjSqaSJNiEoMXxX","event_ts":"1748000000"}}';
const parsed = JSON.parse(rawBody);
console.log('parsed.d:', parsed.d);
console.log('handleValidation result:', handleValidation('X0GJ8j6F9pIXcU8Y', parsed.d));
