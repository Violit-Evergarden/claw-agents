console.log('config path:', require.resolve('./config.json'));
const c = require('./config.json');
c.bots.forEach((b, i) => {
  console.log(`bot[${i}] appId=${b.appId} appSecret="${b.appSecret}" len=${b.appSecret.length}`);
});
