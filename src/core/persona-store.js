'use strict';

const fs = require('fs');
const path = require('path');

// 存储目录：与 memory-store 同级，放在项目根的 data/ 下
const DATA_DIR = path.join(__dirname, '../../data/personas');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function personaFile(agentId) {
  return path.join(DATA_DIR, `${agentId}.json`);
}

/**
 * 读取 Agent 人设配置
 * @param {string} agentId
 * @param {string} defaultPrompt - 如果文件不存在，使用此默认值初始化
 * @returns {{ name: string, description: string, systemPrompt: string, updatedAt: string }}
 */
function getPersona(agentId, defaultPrompt = '') {
  ensureDir();
  const file = personaFile(agentId);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error(`[PersonaStore] Failed to parse ${file}:`, e.message);
    }
  }
  // 首次使用：用代码里的默认值初始化文件
  const initial = {
    systemPrompt: defaultPrompt,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

/**
 * 保存 Agent 人设配置
 * @param {string} agentId
 * @param {{ systemPrompt: string }} data
 */
function savePersona(agentId, data) {
  ensureDir();
  const file = personaFile(agentId);
  const existing = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf-8'))
    : {};
  const updated = {
    ...existing,
    ...data,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

module.exports = { getPersona, savePersona };
