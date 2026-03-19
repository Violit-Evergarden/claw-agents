// 临时在 handleValidation 里注入诊断，打印实际 secret
// 这个脚本模拟和服务一样的加载方式
const path = require('path');
const configPath = path.resolve(__dirname, 'config.json');
console.log('config path:', configPath);
const config = require(configPath);
console.log('bot[0] appId:', config.bots[0].appId);
console.log('bot[0] appSecret:', config.bots[0].appSecret);

// 用这个 secret 算签名
const crypto = require('crypto');
const secret = config.bots[0].appSecret;
const event_ts = '1773582660';
const plain_token = 'R5y7QsPTMl5wXO7ovONS';

let seed = secret;
while (seed.length < 32) seed = seed + seed;
seed = seed.slice(0, 32);
console.log('seed (first 32):', seed);

const seedBuf = Buffer.from(seed, 'utf8');
const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
const msg = Buffer.from(event_ts + plain_token, 'utf8');
const sig = crypto.sign(null, msg, privateKey).toString('hex');
console.log('expected sig:', sig);
console.log('server sent: ', 'e0ac6befc854e275419a94a1fe8a1d075d632aa9a7032a1f3ae07d8d79b932d479f0783181c18687ee53e6b1f3849708e4fc37149feeadddec73440aab2eb00b');
