'use strict';
const crypto = require('crypto');

// ── 真实请求参数 ──
const appSecret = 'X0GJ8j6F9pIXcU8Y';  // violet 的 appSecret
const event_ts  = '1773582076';
const plain_token = '2QEawdBh6U5PRGw8Ey4J';
const ourSig = 'a4666dc9f8dca92a678725818d421b263ac969b436880329e463ef39f55c6c90cc45232dffc99a24ed7f3da0333a439a7cb92240421e88a42bf080466c844d0f';

// ── 用官方测试向量先确认算法本身没问题 ──
function sign(secret, ts, token) {
  let seed = secret;
  while (seed.length < 32) seed = seed + seed;
  seed = seed.slice(0, 32);
  const seedBuf = Buffer.from(seed, 'utf8');
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(ts + token, 'utf8');
  return crypto.sign(null, msg, privateKey).toString('hex');
}

// 官方测试向量验证
const officialSig = sign('DG5g3B4j9X2KOErG', '1725442341', 'Arq0D5A61EgUu4OxUvOp');
const officialExpected = '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706';
console.log('官方测试向量 match:', officialSig === officialExpected);

// 用真实参数签名
const realSig = sign(appSecret, event_ts, plain_token);
console.log('\n--- 真实参数 ---');
console.log('appSecret:', appSecret, '(长度:', appSecret.length, ')');
console.log('seed (取前32字节):', (appSecret + appSecret).slice(0, 32));
console.log('event_ts:', event_ts);
console.log('plain_token:', plain_token);
console.log('我们发出的签名:', ourSig, '(长度:', ourSig.length, ')');
console.log('本地计算签名:  ', realSig, '(长度:', realSig.length, ')');
console.log('两者一致:', ourSig === realSig);
