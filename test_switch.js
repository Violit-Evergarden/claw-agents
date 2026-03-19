const llm = require('./src/core/llm-client');
const fs = require('fs');

// 备份当前 config
const original = fs.readFileSync('./config.json', 'utf8');

try {
  console.log('=== 测试切换到 grok ===');
  // 先给 grok 一个假的 key
  llm.updateProviderApiKey('grok', 'xai-test-fake-key-for-validation');
  const result = llm.switchProvider('grok', { model: 'grok-3' });
  console.log('切换成功, activeProvider:', result.activeProvider);
  
  const cfg = llm.getActiveProviderConfig();
  console.log('grok config:', JSON.stringify(cfg, null, 2));

  console.log('\n=== 切换回 deepseek ===');
  llm.switchProvider('deepseek');
  const cfg2 = llm.getActiveProviderConfig();
  console.log('deepseek config model:', cfg2.model);
  console.log('\n所有测试通过!');
} catch (e) {
  console.error('测试失败:', e.message);
} finally {
  // 恢复原始 config
  fs.writeFileSync('./config.json', original, 'utf8');
  console.log('config.json 已恢复');
}
