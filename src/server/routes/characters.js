'use strict';

const express = require('express');
const router = express.Router();
const characterStore = require('../../core/character-store');
const storyStateStore = require('../../core/story-state-store');
const agentManager = require('../../core/agent-manager');

/**
 * GET /api/characters
 * 获取所有角色列表 + 当前激活角色 ID
 */
router.get('/', (req, res) => {
  const characters = characterStore.listCharacters();
  const activeId = characterStore.getActiveCharacterId();
  res.json({ success: true, data: characters, activeCharacterId: activeId });
});

/**
 * GET /api/characters/active
 * 获取当前激活的角色
 */
router.get('/active', (req, res) => {
  const character = characterStore.getActiveCharacter();
  if (!character) return res.json({ success: true, data: null });
  res.json({ success: true, data: character });
});

/**
 * POST /api/characters
 * 创建新角色
 * Body: { name, systemPrompt, description?, avatarColor? }
 */
router.post('/', (req, res) => {
  const { name, systemPrompt, description, avatarColor, imageBasePrompt, personaEssence, appearanceKeywords } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: '角色名称不能为空' });
  }
  const character = characterStore.createCharacter({
    name: name.trim(),
    systemPrompt: systemPrompt || '',
    description: description || '',
    avatarColor,
    imageBasePrompt,
    personaEssence,
    appearanceKeywords,
  });
  res.json({ success: true, data: character });
});

/**
 * GET /api/characters/:id
 * 获取单个角色
 */
router.get('/:id', (req, res) => {
  const character = characterStore.getCharacter(req.params.id);
  if (!character) return res.status(404).json({ success: false, error: '角色不存在' });
  res.json({ success: true, data: character });
});

/**
 * PUT /api/characters/:id
 * 更新角色信息
 * Body: { name?, description?, systemPrompt?, avatarColor? }
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, systemPrompt, avatarColor, imageBasePrompt, personaEssence, appearanceKeywords } = req.body;

  const updated = characterStore.updateCharacter(id, {
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description }),
    ...(systemPrompt !== undefined && { systemPrompt }),
    ...(avatarColor !== undefined && { avatarColor }),
    ...(imageBasePrompt !== undefined && { imageBasePrompt }),
    ...(personaEssence !== undefined && { personaEssence }),
    ...(appearanceKeywords !== undefined && { appearanceKeywords }),
  });

  if (!updated) return res.status(404).json({ success: false, error: '角色不存在' });

  agentManager.getAll().forEach(agent => {
    try {
      agentManager.updateSystemPrompt(agent.id, updated.systemPrompt || '');
    } catch (_) { /* ignore */ }
  });

  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/characters/:id
 * 删除角色（同时删除其记忆）
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // 不允许删除最后一个角色
  const all = characterStore.listCharacters();
  if (all.length <= 1) {
    return res.status(400).json({ success: false, error: '至少保留一个角色' });
  }

  const deleted = characterStore.deleteCharacter(id);
  if (!deleted) return res.status(404).json({ success: false, error: '角色不存在' });

  // 如果删掉的是激活角色，自动切换到第一个剩余角色
  const remaining = characterStore.listCharacters();
  const newActive = remaining[0];
  if (newActive) {
    characterStore.switchCharacter(newActive.id);
    agentManager.getAll().forEach(agent => {
      try {
        agentManager.updateSystemPrompt(agent.id, newActive.systemPrompt || '');
      } catch (_) { /* ignore */ }
    });
  }

  res.json({ success: true, deletedId: id, newActiveCharacterId: newActive?.id || null });
});

/**
 * POST /api/characters/:id/activate
 * 切换当前激活角色（立即热更新 agent 的 system prompt）
 */
router.post('/:id/activate', (req, res) => {
  const { id } = req.params;
  const character = characterStore.switchCharacter(id);
  if (!character) return res.status(404).json({ success: false, error: '角色不存在' });

  // 热更新 agentManager 中的 systemPrompt
  try {
    agentManager.getAll().forEach(agent => {
      agentManager.updateSystemPrompt(agent.id, character.systemPrompt || '');
    });
  } catch (_) { /* ignore */ }

  res.json({ success: true, data: character });
});

/**
 * GET /api/characters/:id/story
 * 获取角色剧情状态
 */
router.get('/:id/story', (req, res) => {
  const state = storyStateStore.getState(req.params.id);
  res.json({ success: true, data: state });
});

module.exports = router;
