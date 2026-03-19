const crypto = require('crypto');

const secret = 'MAymaOC0peTI7wlbRH7xndULC3ulcUME';
const plain_token = 'fkmLVBvPURWwKpTyhC3D';
// event_ts 需要从请求 body 里读，这里先算反推
// 已知返回的签名是
const returned_sig = 'd7ad8990a985aafe8ba580784734ecdf2a9129d6f004bec6b7ec931533566c4a6506f43a0f5cec4cc5750cbfe91a3c45431c54f2a62281d871fb694a0bd8e50e';

function calcSig(secret, event_ts, plain_token) {
  let seed = secret;
  while (seed.length < 32) seed = seed + seed;
  seed = seed.slice(0, 32);
  const seedBuf = Buffer.from(seed, 'utf8');
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(event_ts + plain_token, 'utf8');
  return crypto.sign(null, msg, privateKey).toString('hex');
}

// 尝试推算 event_ts，先用最近的时间戳范围
// Request time: 2026-03-15T22:05:03+08:00 = 1773583503
const ts = '1773583503';
const sig = calcSig(secret, ts, plain_token);
console.log('plain_token:', plain_token);
console.log('event_ts try:', ts);
console.log('calc sig:', sig);
console.log('returned:', returned_sig);
console.log('match:', sig === returned_sig);
console.log('returned sig length:', returned_sig.length);
