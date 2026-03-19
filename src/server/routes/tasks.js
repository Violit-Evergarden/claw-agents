'use strict';

const express = require('express');
const router = express.Router();
const cronManager = require('../../scheduler/cron-manager');

// GET /api/tasks - 获取所有任务
router.get('/', (req, res) => {
  const tasks = cronManager.getAllTasks();
  res.json({ success: true, data: tasks });
});

// POST /api/tasks - 手动新增任务
router.post('/', (req, res) => {
  const { cronExpr, action, description, content, platform, agentId } = req.body;
  if (!cronExpr || !action || !description) {
    return res.status(400).json({ success: false, error: 'cronExpr, action, description required' });
  }
  const taskId = cronManager.addTask({ cronExpr, action, description, content, platform, agentId: agentId || 'manual' });
  res.json({ success: true, data: { taskId } });
});

// DELETE /api/tasks/:id - 删除任务
router.delete('/:id', (req, res) => {
  cronManager.removeTask(req.params.id);
  res.json({ success: true });
});

// POST /api/tasks/:id/pause - 暂停任务
router.post('/:id/pause', (req, res) => {
  cronManager.pauseTask(req.params.id);
  res.json({ success: true });
});

// POST /api/tasks/:id/resume - 恢复任务
router.post('/:id/resume', (req, res) => {
  cronManager.resumeTask(req.params.id);
  res.json({ success: true });
});

// POST /api/tasks/:id/trigger - 立即触发任务
router.post('/:id/trigger', async (req, res) => {
  cronManager.triggerNow(req.params.id)
    .then(() => {})
    .catch(err => console.error(`[API] Task trigger error: ${err.message}`));
  res.json({ success: true });
});

module.exports = router;
