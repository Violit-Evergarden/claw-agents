'use strict';
const crypto = require('crypto');

const appSecret = 'X0GJ8j6F9pIXcU8Y';
const event_ts  = '1773582076';
const plain_token = '2QEawdBh6U5PRGw8Ey4J';

const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');

function signWithEncoding(encoding) {
  let seed = appSecret;
  while (Buffer.byteLength(seed, encoding) < 32) seed = seed + seed;
  // 取前32字节
  const fullBuf = Buffer.from(seed, encoding);
  const seedBuf = fullBuf.slice(0, 32);
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  try {
    const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    const msg = Buffer.from(event_ts + plain_token, 'utf8');
    const sig = crypto.sign(null, msg, privateKey).toString('hex');
    // 同时导出对应的公钥
    const pubKey = crypto.createPublicKey(privateKey);
    const pubHex = pubKey.export({ format: 'der', type: 'spki' }).slice(-32).toString('hex');
    return { sig, pubHex };
  } catch(e) {
    return { sig: 'ERROR: ' + e.message };
  }
}

// 测试所有可能的编码
const encodings = ['utf8', 'ascii', 'latin1', 'binary', 'hex', 'base64'];
for (const enc of encodings) {
  const r = signWithEncoding(enc);
  console.log(`[${enc}] sig: ${r.sig}`);
  if (r.pubHex) console.log(`[${enc}] pub: ${r.pubHex}`);
  console.log();
}

// 另一个思路：seed 直接用 appSecret 的 hex 解码
// 即把 appSecret 当成 hex 字符串，解码成 bytes
console.log('--- 特殊情况：appSecret as hex bytes ---');
try {
  // X0GJ8j6F9pIXcU8Y 含非hex字符，会报错
  const seedBuf2 = Buffer.from(appSecret, 'hex');
  console.log('hex decode result len:', seedBuf2.length, 'bytes:', seedBuf2.toString('hex'));
} catch(e) {
  console.log('hex decode error:', e.message);
}

// 再测一个：seed 不重复，直接 pad 到32字节（用0填充）
console.log('\n--- 特殊情况：不重复，用0 pad ---');
{
  const seedBuf = Buffer.alloc(32, 0);
  Buffer.from(appSecret, 'utf8').copy(seedBuf);
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(event_ts + plain_token, 'utf8');
  const sig = crypto.sign(null, msg, privateKey).toString('hex');
  console.log('zero-padded sig:', sig);
}
