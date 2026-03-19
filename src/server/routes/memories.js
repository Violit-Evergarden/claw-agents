'use strict';

const express = require('express');
const router = express.Router();
const memoryStore = require('../../core/memory-store');
const { sseManager } = require('../sse');

/**
 * GET /api/memories/:agentId
 * 获取某个 Agent 的所有长期记忆（按 category 分组）
 */
router.get('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { category, keyword } = req.query;

  let memories = keyword
    ? memoryStore.searchMemory(agentId, keyword)
    : memoryStore.getAllMemories(agentId);

  if (category && category !== 'all') {
    memories = memories.filter(m => m.category === category);
  }

  // 按 category 分组
  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  // 每组内按重要程度和时间排序
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);
  }

  res.json({
    agentId,
    total: memories.length,
    categories: memoryStore.CATEGORY_LABELS,
    grouped,
    flat: memories.sort((a, b) => b.createdAt - a.createdAt),
  });
});

/**
 * POST /api/memories/:agentId
 * 手动添加一条回忆
 */
router.post('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { category, content, importance, sourceDate } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: '回忆内容不能为空' });
  }

  const entry = memoryStore.upsertMemory(agentId, {
    category: category || 'event',
    content: content.trim(),
    importance: importance || 2,
    sourceDate: sourceDate || new Date().toISOString().slice(0, 10),
  });

  // SSE 推送
  sseManager.broadcast({ type: 'memory_added', agentId, memory: entry });

  res.json({ success: true, memory: entry });
});

/**
 * DELETE /api/memories/:agentId/:memoryId
 * 删除一条回忆
 */
router.delete('/:agentId/:memoryId', (req, res) => {
  const { agentId, memoryId } = req.params;
  const deleted = memoryStore.deleteMemory(agentId, memoryId);

  if (!deleted) {
    return res.status(404).json({ error: '未找到该回忆' });
  }

  // SSE 推送
  sseManager.broadcast({ type: 'memory_deleted', agentId, memoryId });

  res.json({ success: true, memoryId });
});

/**
 * DELETE /api/memories/:agentId
 * 按 category 批量清空（查询参数 ?category=xxx）
 */
router.delete('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { category } = req.query;

  const allMemories = memoryStore.getAllMemories(agentId);
  let toDelete;

  if (category && category !== 'all') {
    toDelete = allMemories.filter(m => m.category === category);
  } else {
    toDelete = allMemories;
  }

  let count = 0;
  for (const m of toDelete) {
    if (memoryStore.deleteMemory(agentId, m.id)) count++;
  }

  res.json({ success: true, deleted: count });
});

module.exports = router;
