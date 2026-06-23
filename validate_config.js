'use strict';

const { loadConfig, validateConfig } = require('./src/core/config-loader');

try {
  const config = loadConfig();
  console.log('Config OK');
  console.log('Top-level keys:', Object.keys(config).join(', '));
  console.log('providers:', Object.keys(config.providers || {}).join(', '));
  console.log('activeProvider:', config.llm && config.llm.activeProvider);
  console.log('llm.model:', config.llm && config.llm.model);

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.warn('Validation warnings:');
    errors.forEach(e => console.warn(' -', e));
    process.exit(1);
  }
} catch (e) {
  console.error('Config ERROR:', e.message);
  process.exit(1);
}
