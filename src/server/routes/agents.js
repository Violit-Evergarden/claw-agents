'use strict';

const express = require('express');
const router = express.Router();
const agentManager = require('../../core/agent-manager');
const personaStore = require('../../core/persona-store');

// GET /api/agents - 获取所有 Agent 状态
router.get('/', (req, res) => {
  res.json({ success: true, data: agentManager.getAll() });
});

// GET /api/agents/:id - 获取单个 Agent 详情（含日志）
router.get('/:id', (req, res) => {
  const agent = agentManager.getById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
  res.json({ success: true, data: agent });
});

// POST /api/agents/:id/trigger - 手动触发 Agent
router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  agentManager.triggerManually(id)
    .then(() => {})
    .catch(err => console.error(`[API] Trigger error: ${err.message}`));
  res.json({ success: true, message: `Agent ${id} triggered` });
});

// POST /api/agents/:id/message - 向 Agent 发送消息（调试用）
router.post('/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'message required' });
  agentManager.dispatchMessage(id, message, 'api')
    .then(() => {})
    .catch(err => console.error(`[API] Message dispatch error: ${err.message}`));
  res.json({ success: true, message: 'Message dispatched' });
});

// GET /api/agents/:id/persona - 读取人设
router.get('/:id/persona', (req, res) => {
  const { id } = req.params;
  // 先从已注册的 agent 里拿当前生效的 systemPrompt
  const agent = agentManager.getById(id);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
  const stored = personaStore.getPersona(id, agent.systemPrompt);
  res.json({ success: true, data: stored });
});

// PUT /api/agents/:id/persona - 更新人设（立即生效）
router.put('/:id/persona', (req, res) => {
  const { id } = req.params;
  const { systemPrompt } = req.body;
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
    return res.status(400).json({ success: false, error: 'systemPrompt (string) required' });
  }
  const agent = agentManager.getById(id);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

  // 1. 持久化到文件
  const saved = personaStore.savePersona(id, { systemPrompt: systemPrompt.trim() });
  // 2. 热更新内存中的 config（下一次 LLM 调用立即生效）
  agentManager.updateSystemPrompt(id, systemPrompt.trim());

  res.json({ success: true, data: saved });
});

module.exports = router;

