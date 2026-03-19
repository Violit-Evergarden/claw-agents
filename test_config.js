'use strict';
const config = require('./config.json');
console.log('Server port:', config.server.port);
console.log('\nWebhook URLs:');
config.bots.forEach((b, i) => {
  if (b.enabled !== false) {
    console.log(`  Bot ${i}: agentId=${b.agentId}, appId=${b.appId}`);
    console.log(`    URL: http://your-domain/webhook/qq/${i}`);
    console.log(`    appSecret length: ${b.appSecret.length}`);
  }
});
