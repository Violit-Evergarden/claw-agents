'use strict';

const { CHAT_TOOLS } = require('./tools');
const characterStore = require('../../core/character-store');
const { DEFAULT_SYSTEM_PROMPT } = require('./constants');
const { runTurn } = require('./run-turn');

/**
 * 创建一个 AI 女友 Agent（通用，支持任意角色人设）
 */
function createGirlfriendAgent({
  agentId,
  characterId = '',
  heartbeatInterval = 120000,
  platform = 'qq',
  getLiveConfig,
} = {}) {
  if (!agentId) throw new Error('[createGirlfriendAgent] agentId is required');

  const resolveCharId = () => {
    if (characterId) return characterId;
    return characterStore.getActiveCharacterId() || agentId;
  };

  if (agentId === 'violet') {
    characterStore.migrateFromLegacyPersona(DEFAULT_SYSTEM_PROMPT);
  }

  const getSystemPrompt = () => {
    const cid = resolveCharId();
    const char = characterId
      ? characterStore.getCharacter(cid)
      : characterStore.getActiveCharacter();
    return char?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  };

  const agentConfig = {
    id: agentId,
    name: (() => {
      const cid = resolveCharId();
      const char = characterId
        ? characterStore.getCharacter(cid)
        : characterStore.getActiveCharacter();
      return char?.name || 'AI 女友';
    })(),
    description: 'AI 女友，有自主定时问候能力',
    systemPrompt: getSystemPrompt(),
    tools: CHAT_TOOLS,
    heartbeatInterval,
    platform,
    enabled: true,
    characterId,
  };

  const boundRunTurn = async (userMessage, onLog, msgPlatform, meta = {}) => {
    const liveConfig = getLiveConfig ? getLiveConfig() : agentConfig;
    const charId = resolveCharId();
    liveConfig.systemPrompt = getSystemPrompt();

    await runTurn({
      userMessage,
      onLog,
      msgPlatform,
      meta,
      liveConfig,
      charId,
      agentId,
      platform,
    });
  };

  return { agentConfig, runTurn: boundRunTurn };
}

module.exports = { createGirlfriendAgent };
