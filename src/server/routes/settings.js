'use strict';

const express = require('express');
const router = express.Router();
const llmClient = require('../../core/llm-client');

/**
 * GET /api/settings/llm
 * 返回当前激活的 provider 以及所有 provider 列表
 */
router.get('/llm', (req, res) => {
  try {
    const data = llmClient.getProviders();
    const active = llmClient.getActiveProviderConfig();
    res.json({
      success: true,
      data: {
        ...data,
        activeModel: active.model,
        activeMemoryModel: active.memoryModel,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/settings/llm/switch
 * 切换激活的 provider / 模型
 * Body: { provider: string, model?: string, memoryModel?: string }
 */
router.put('/llm/switch', (req, res) => {
  const { provider, model, memoryModel } = req.body || {};
  if (!provider) {
    return res.status(400).json({ success: false, error: 'provider is required' });
  }
  try {
    const result = llmClient.switchProvider(provider, { model, memoryModel });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/settings/llm/apikey
 * 更新指定 provider 的 API Key
 * Body: { provider: string, apiKey: string }
 */
router.put('/llm/apikey', (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (!provider || !apiKey) {
    return res.status(400).json({ success: false, error: 'provider and apiKey are required' });
  }
  try {
    llmClient.updateProviderApiKey(provider, apiKey);
    res.json({
      success: true,
      message: `API key updated for provider: ${provider}（当前进程有效；持久化请设置环境变量 LLM_API_KEY_${provider.toUpperCase()}）`,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
