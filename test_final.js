const crypto = require('crypto');

const secret = 'MAymaOC0peTI7wlbRH7xndULC3ulcUME';
const event_ts = '1773582660';
const plain_token = 'R5y7QsPTMl5wXO7ovONS';
const server_sent = 'e0ac6befc854e275419a94a1fe8a1d075d632aa9a7032a1f3ae07d8d79b932d479f0783181c18687ee53e6b1f3849708e4fc37149feeadddec73440aab2eb00b';

let seed = secret;
while (seed.length < 32) seed = seed + seed;
seed = seed.slice(0, 32);

const seedBuf = Buffer.from(seed, 'utf8');
const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });

const msg = Buffer.from(event_ts + plain_token, 'utf8');
const sig = crypto.sign(null, msg, privateKey).toString('hex');

console.log('secret used:', secret);
console.log('sig length:', sig.length);
console.log('local sig:  ', sig);
console.log('server sent:', server_sent);
console.log('sent length:', server_sent.length);
console.log('match:', sig === server_sent);
