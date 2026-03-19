const crypto = require('crypto');

// Go 的 ed25519.GenerateKey(reader) 内部实现：
// 1. 从 reader 读取 32 字节作为 seed
// 2. 对 seed 做 SHA-512，得到 64 字节
// 3. 前 32 字节是私钥标量，后 32 字节推导出公钥
// Node.js crypto 模块的 PKCS8 方式是直接把 seed 作为私钥原始字节
// 而 Go 的 GenerateKey 会对 seed 再做一次 SHA-512

// 官方测试向量
const TEST_SECRET = 'DG5g3B4j9X2KOErG';
const TEST_EVENT_TS = '1725442341';
const TEST_PLAIN_TOKEN = 'Arq0D5A61EgUu4OxUvOp';
const TEST_EXPECTED = '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706';

function getSeed(secret) {
  let seed = secret;
  while (seed.length < 32) seed = seed + seed;
  return seed.slice(0, 32);
}

// 方法A：PKCS8 方式（当前实现）
function signPKCS8(secret, event_ts, plain_token) {
  const seed = getSeed(secret);
  const seedBuf = Buffer.from(seed, 'utf8');
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(event_ts + plain_token, 'utf8');
  return crypto.sign(null, msg, privateKey).toString('hex');
}

// 方法B：Go GenerateKey 等效实现
// Go 的 generateKey 从 reader 读 32 字节作为 seed，然后：
//   digest := sha512(seed)
//   privateKey = digest[0:32]  (clamp 操作)
//   publicKey 从 privateKey 推导
// Node.js crypto 内部的 ed25519 也是这样，但 PKCS8 封装时
// 它把那 32 字节直接作为 seed 存储，sign 时内部会做 SHA-512
// 所以两者实际上是一样的...

// 方法C：用 SubtleCrypto/WebCrypto 风格
// 直接生成 ed25519 keypair from seed，看看有没有不同

// 方法D：用 SHA-512 手动派生私钥
function signViaManualDerive(secret, event_ts, plain_token) {
  const seed = Buffer.from(getSeed(secret), 'utf8');
  // SHA-512 of seed
  const h = crypto.createHash('sha512').update(seed).digest();
  // clamp: h[0] &= 248, h[31] &= 127, h[31] |= 64
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;
  // 用 h[0:32] 作为私钥 scalar —— 这不是标准 Node.js API 支持的方式
  // 尝试直接用派生后的前 32 字节作为新 seed 传给 PKCS8
  const derivedSeed = h.slice(0, 32);
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, derivedSeed]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const msg = Buffer.from(event_ts + plain_token, 'utf8');
  return crypto.sign(null, msg, privateKey).toString('hex');
}

console.log('=== 官方测试向量验证 ===');
console.log('expected:', TEST_EXPECTED);
console.log('方法A (PKCS8):', signPKCS8(TEST_SECRET, TEST_EVENT_TS, TEST_PLAIN_TOKEN));
console.log('方法D (SHA512 derive):', signViaManualDerive(TEST_SECRET, TEST_EVENT_TS, TEST_PLAIN_TOKEN));
console.log('');

// 真实校验参数
const REAL_SECRET = 'MAymaOC0peTI7wlbRH7xndULC3ulcUME';
const REAL_EVENT_TS = '1773583367';
const REAL_PLAIN_TOKEN = 'yYsdbfX6Z1SSO5m7H23c';
const REAL_SERVER_SENT = '7d311bab3cd3328d77e0d5c8e268fac7e6f4de99afb91846fa2b6b6e04c0a9370b160addf6de3654b6d809788e73d2b4ac0910385d48b8d63e28c2f5cc6a9806';

console.log('=== 真实校验参数 ===');
console.log('server sent:', REAL_SERVER_SENT);
console.log('方法A:', signPKCS8(REAL_SECRET, REAL_EVENT_TS, REAL_PLAIN_TOKEN));
console.log('方法D:', signViaManualDerive(REAL_SECRET, REAL_EVENT_TS, REAL_PLAIN_TOKEN));
