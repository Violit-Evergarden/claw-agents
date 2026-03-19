'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../../data/characters');
const ACTIVE_FILE = path.join(DATA_DIR, '_active.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function characterFile(characterId) {
  return path.join(DATA_DIR, `${characterId}.json`);
}

// ── 读 / 写 ──────────────────────────────────────────────────

/**
 * 读取所有角色列表（不含 _active 文件）
 * @returns {Character[]}
 */
function listCharacters() {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/**
 * 读取单个角色
 * @param {string} characterId
 */
function getCharacter(characterId) {
  const file = characterFile(characterId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 创建新角色
 * @param {{ name: string, systemPrompt: string, description?: string, avatarColor?: string }} data
 * @returns {Character}
 */
function createCharacter(data) {
  ensureDir();
  const id = uuidv4().replace(/-/g, '').slice(0, 12);
  const character = {
    id,
    name: data.name || '新角色',
    description: data.description || '',
    systemPrompt: data.systemPrompt || '',
    avatarColor: data.avatarColor || randomColor(),
    createdAt: Date.now(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(characterFile(id), JSON.stringify(character, null, 2), 'utf-8');
  return character;
}

/**
 * 更新角色信息
 * @param {string} characterId
 * @param {{ name?, description?, systemPrompt?, avatarColor? }} patch
 * @returns {Character|null}
 */
function updateCharacter(characterId, patch) {
  const existing = getCharacter(characterId);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...patch,
    id: characterId, // 不允许修改 id
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(characterFile(characterId), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

/**
 * 删除角色（同时删除记忆文件）
 * @param {string} characterId
 * @returns {boolean}
 */
function deleteCharacter(characterId) {
  const file = characterFile(characterId);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);

  // 同时删除记忆文件
  const memoryFile = path.join(__dirname, '../../data/memory', `${characterId}.json`);
  if (fs.existsSync(memoryFile)) {
    fs.unlinkSync(memoryFile);
  }

  // 如果删除的是当前激活角色，清空激活状态
  const active = getActiveCharacterId();
  if (active === characterId) {
    saveActiveCharacterId(null);
  }

  return true;
}

// ── 激活角色 ────────────────────────────────────────────────

/**
 * 获取当前激活的角色 ID
 * @returns {string|null}
 */
function getActiveCharacterId() {
  ensureDir();
  if (!fs.existsSync(ACTIVE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf-8'));
    return data.activeCharacterId || null;
  } catch {
    return null;
  }
}

/**
 * 保存激活角色 ID
 * @param {string|null} characterId
 */
function saveActiveCharacterId(characterId) {
  ensureDir();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeCharacterId: characterId }, null, 2), 'utf-8');
}

/**
 * 获取当前激活的角色完整数据
 * 如果没有激活角色，尝试返回第一个角色；如果没有任何角色，返回 null
 */
function getActiveCharacter() {
  const id = getActiveCharacterId();
  if (id) {
    const c = getCharacter(id);
    if (c) return c;
  }
  // 回退到第一个角色
  const all = listCharacters();
  if (all.length > 0) {
    saveActiveCharacterId(all[0].id);
    return all[0];
  }
  return null;
}

/**
 * 切换激活角色
 * @param {string} characterId
 * @returns {Character|null}
 */
function switchCharacter(characterId) {
  const character = getCharacter(characterId);
  if (!character) return null;
  saveActiveCharacterId(characterId);
  return character;
}

// ── 迁移：将旧的 violet persona 导入为默认角色 ──────────────

/**
 * 首次启动时，将 data/personas/violet.json 迁移为第一个角色
 * 仅在 characters 目录为空时执行一次
 */
function migrateFromLegacyPersona(fallbackSystemPrompt = '') {
  ensureDir();
  const existing = listCharacters();
  if (existing.length > 0) return; // 已有角色，跳过

  // 尝试读取旧人设文件
  const legacyPersonaFile = path.join(__dirname, '../../data/personas/violet.json');
  let systemPrompt = fallbackSystemPrompt;
  let name = 'AI 女友';

  if (fs.existsSync(legacyPersonaFile)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPersonaFile, 'utf-8'));
      if (legacy.systemPrompt) systemPrompt = legacy.systemPrompt;
      if (legacy.name) name = legacy.name;
    } catch {
      // ignore
    }
  }

  // 从 systemPrompt 里提取名字（第一行通常有"你叫XXX"或"你是XXX"）
  const nameMatch = systemPrompt.match(/你(?:叫|是|名叫)(\S{1,8})[，,。\s]/);
  if (nameMatch) name = nameMatch[1];

  const character = createCharacter({
    name,
    systemPrompt,
    description: 'AI 女友，有自主定时问候能力',
    avatarColor: '#8b5cf6',
  });

  // 迁移旧记忆文件
  const oldMemoryFile = path.join(__dirname, '../../data/memory/violet.json');
  const newMemoryFile = path.join(__dirname, '../../data/memory', `${character.id}.json`);
  if (fs.existsSync(oldMemoryFile) && !fs.existsSync(newMemoryFile)) {
    fs.copyFileSync(oldMemoryFile, newMemoryFile);
  }

  saveActiveCharacterId(character.id);
  console.log(`[CharacterStore] Migrated legacy persona as character "${name}" (id: ${character.id})`);
  return character;
}

// ── 工具 ────────────────────────────────────────────────────

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
let _colorIdx = 0;
function randomColor() {
  return COLORS[_colorIdx++ % COLORS.length];
}

module.exports = {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getActiveCharacterId,
  getActiveCharacter,
  switchCharacter,
  migrateFromLegacyPersona,
};
