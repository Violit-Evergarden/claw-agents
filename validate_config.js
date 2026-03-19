try {
  const c = require('./config.json');
  console.log('Config OK');
  console.log('Top-level keys:', Object.keys(c).join(', '));
  console.log('providers:', Object.keys(c.providers || {}).join(', '));
  console.log('activeProvider:', c.llm && c.llm.activeProvider);
  console.log('llm.model:', c.llm && c.llm.model);
} catch (e) {
  console.error('Config ERROR:', e.message);
}
