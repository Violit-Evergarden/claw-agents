'use strict';

const express = require('express');
const router = express.Router();
const agentManager = require('../../core/agent-manager');

router.get('/', (req, res) => {
  res.json({ success: true, data: agentManager.getAll() });
});

router.get('/:id', (req, res) => {
  const agent = agentManager.getById(req.params.id);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
  res.json({ success: true, data: agent });
});

router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  try {
    await agentManager.triggerManually(id);
    res.json({ success: true, message: `Agent ${id} triggered` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'message required' });
  try {
    await agentManager.dispatchMessage(id, message, 'api');
    res.json({ success: true, message: 'Message dispatched' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
