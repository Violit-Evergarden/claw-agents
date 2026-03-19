'use strict';

const agentLoop = require('../../core/agent-loop');
const memoryStore = require('../../core/memory-store');
const messageRouter = require('../../adapters/message-router');

const AGENT_ID = 'assistant';

const SYSTEM_PROMPT = `你是一个高效的 AI 工作助理。你的职责是帮助用户处理日常工作任务，提供专业建议，协助管理时间和任务。

【工作方式】
- 简洁高效：给出直接、可执行的建议，避免废话
- 专业严谨：在涉及专业领域时，提供准确、有依据的信息
- 主动预判：理解用户需求背后的深层目标，提前给出相关建议
- 结构清晰：复杂问题用列表、步骤等格式呈现

【能力范围】
- 文档写作、邮件起草、报告撰写
- 信息检索与整理
- 任务规划与时间管理建议
- 代码辅助与技术问题解答
- 数据分析思路

请保持专业、高效的助理风格，帮助用户最大化工作效率。`;

const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: '向用户发送消息',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '消息内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_memory',
      description: '记住一个重要信息',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: '要记住的信息' },
        },
        required: ['fact'],
      },
    },
  },
];

function buildToolExecutors(agentConfig) {
  return {
    send_message: async (args) => {
      await messageRouter.sendMessage(agentConfig.platform || 'console', args.content);
      return `消息已发送`;
    },
    add_memory: async (args) => {
      memoryStore.addFact(AGENT_ID, args.fact);
      return `已记住：${args.fact}`;
    },
  };
}

function createAssistantAgent() {
  const config = require('../../../config.json');
  const agentConfig = {
    id: AGENT_ID,
    name: '工作助理',
    description: '专业 AI 工作助理，帮助处理日常工作任务',
    systemPrompt: SYSTEM_PROMPT,
    tools: ASSISTANT_TOOLS,
    heartbeatInterval: 0, // 助理不主动心跳，只响应消息
    platform: config.agents.assistant.platform || 'console',
    enabled: config.agents.assistant.enabled !== false,
  };

  const toolExecutors = buildToolExecutors(agentConfig);

  const runTurn = async (userMessage, onLog) => {
    if (!userMessage) return; // 助理不主动触发
    await agentLoop.runAgentTurn(agentConfig, userMessage, toolExecutors, onLog);
  };

  return { agentConfig, runTurn };
}

module.exports = { createAssistantAgent, AGENT_ID };
