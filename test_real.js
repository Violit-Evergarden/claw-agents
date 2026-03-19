'use strict';
const crypto = require('crypto');

// 运行时实际的 appSecret
const appSecret = 'RtLnFh9b4X0TwPsLpJnHlFjEjEjEjEkG';
const plain_token = 'R5y7QsPTMl5wXO7ovONS';
const event_ts = '1773582660';
const ourSig = 'e0ac6befc854e275419a94a1fe8a1d075d632aa9a7032a1f3ae07d8d79b932d479f0783181c18687ee53e6b1f3849708e4fc37149feeadddec73440aab2eb00b';

const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
let seed = appSecret;
while (seed.length < 32) seed = seed + seed;
seed = seed.slice(0, 32);
const seedBuf = Buffer.from(seed, 'utf8');
const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
const msg = Buffer.from(event_ts + plain_token, 'utf8');
const sigHex = crypto.sign(null, msg, privateKey).toString('hex');

console.log('用真实secret重算:', sigHex);
console.log('服务发出的签名:  ', ourSig);
console.log('一致:', sigHex === ourSig);

// seed 情况
console.log('\nseed (原文):', appSecret);
console.log('seed (取32):', seed, '(len:', seed.length, ')');
console.log('注意：appSecret长度32，seed就是appSecret本身，不需要重复');
