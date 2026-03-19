const crypto = require('crypto');

// 平台最后一次校验的真实参数（来自日志）
const event_ts = '1773582660';
const plain_token = 'R5y7QsPTMl5wXO7ovONS';
const server_sent = 'e0ac6befc854e275419a94a1fe8a1d075d632aa9a7032a1f3ae07d8d79b932d479f0783181c18687ee53e6b1f3849708e4fc37149feeadddec73440aab2eb00b';

// 当前 config.json 里的 appSecret
const secret = 'MAymaOC0peTI7wlbRH7xndULC3ulcUME';

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

const sig = calcSig(secret, event_ts, plain_token);
console.log('=== 签名对比 ===');
console.log('local calc: ', sig);
console.log('server sent:', server_sent);
console.log('match:', sig === server_sent);
console.log('');
console.log('结论：');
if (sig === server_sent) {
  console.log('✅ 签名一致，说明服务在校验时用的就是新 secret，问题在平台侧公钥未更新');
} else {
  console.log('❌ 签名不一致，说明校验时服务用的是旧 secret（进程未重启）');
  console.log('旧日志 event_ts:', event_ts, '——如果服务是刚重启的，这次校验不算数，需要再触发一次新的校验');
}
