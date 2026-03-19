try {
  const llm = require('./src/core/llm-client');
  console.log('llm-client loaded OK');
  const providers = llm.getProviders();
  console.log('activeProvider:', providers.activeProvider);
  console.log('providers:', providers.providers.map(p => p.id + '(' + (p.hasApiKey ? 'has key' : 'no key') + ')').join(', '));
  const cfg = llm.getActiveProviderConfig();
  console.log('activeConfig:', JSON.stringify(cfg, null, 2));
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}
