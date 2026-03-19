const crypto = require('crypto');

// 平台最新一次真实校验参数
const event_ts = '1773583367';
const plain_token = 'yYsdbfX6Z1SSO5m7H23c';
const server_sent = '7d311bab3cd3328d77e0d5c8e268fac7e6f4de99afb91846fa2b6b6e04c0a9370b160addf6de3654b6d809788e73d2b4ac0910385d48b8d63e28c2f5cc6a9806';

const secret = 'MAymaOC0peTI7wlbRH7xndULC3ulcUME';

let seed = secret;
while (seed.length < 32) seed = seed + seed;
seed = seed.slice(0, 32);
const seedBuf = Buffer.from(seed, 'utf8');
const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
const msg = Buffer.from(event_ts + plain_token, 'utf8');
const sig = crypto.sign(null, msg, privateKey).toString('hex');

console.log('local calc: ', sig);
console.log('server sent:', server_sent);
console.log('match:', sig === server_sent);

if (sig === server_sent) {
  console.log('\n✅ 服务用的就是新 secret，签名正确。问题在 QQ 平台侧公钥未更新。');
} else {
  console.log('\n❌ 签名不同，服务运行时用的不是这个 secret。');
}
