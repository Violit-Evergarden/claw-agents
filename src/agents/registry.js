'use strict';

const { createGirlfriendAgent } = require('./girlfriend/config');
const { createAssistantAgent } = require('./assistant/config');

const AGENT_TYPES = {
  girlfriend: { create: createGirlfriendAgent },
  assistant: { create: createAssistantAgent },
};

/**
 * 根据 type 创建 agent 实例
 * @param {string} type - 'girlfriend' | 'assistant'
 * @param {Object} options - 传给 create 函数的参数
 */
function createAgent(type, options = {}) {
  const entry = AGENT_TYPES[type];
  if (!entry) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENT_TYPES).join(', ')}`);
  }
  return entry.create(options);
}

module.exports = { AGENT_TYPES, createAgent };
