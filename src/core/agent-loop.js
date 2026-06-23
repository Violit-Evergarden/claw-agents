'use strict';

const llmClient = require('./llm-client');
const memoryStore = require('./memory-store');
const storyStateStore = require('./story-state-store');
const { executeToolCalls } = require('./tool-runner');

/**
 * 执行一次完整的 Agent LLM 调用 + tool call 循环
 * @param {Object} agent - Agent 配置对象（含 id, systemPrompt, tools）
 * @param {string|Object|null} input - 用户消息字符串，或 options 对象
 * @param {Object} toolExecutors - tool name -> async function(args) 映射
 * @param {Function} onLog - 日志回调 (level, message)
 * @param {string} [charId] - 可选：角色 ID，用于记忆隔离；不传则与 agentId 相同
 */
async function runAgentTurn(agent, input, toolExecutors, onLog = () => {}, charId) {
  const { id: agentId, systemPrompt, tools = [] } = agent;
  const memoryId = charId || agentId;
  const log = (msg) => onLog('info', msg);
  const logErr = (msg) => onLog('error', msg);

  // 兼容旧签名 runAgentTurn(agent, userMessage, ...) 与新签名 options 对象
  let userMessage = null;
  let ephemeralUserContent = null;
  let persistUserMessage = true;

  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    userMessage = input.userMessage ?? null;
    ephemeralUserContent = input.ephemeralUserContent ?? null;
    persistUserMessage = input.persistUserMessage !== false;
  } else {
    userMessage = input;
  }

  const turnContent = userMessage || ephemeralUserContent;

  const history = memoryStore.getMessages(memoryId);
  const messages = [
    { role: 'system', content: buildSystemPromptWithMemory(systemPrompt, memoryId) },
    ...history,
  ];

  if (turnContent) {
    const userMsg = { role: 'user', content: turnContent };
    messages.push(userMsg);
    if (persistUserMessage && userMessage) {
      memoryStore.appendMessage(memoryId, userMsg);
    }
  }

  let iteration = 0;
  const MAX_ITER = 8;
  let finalContent = null;
  let totalToolsExecuted = 0;

  const newTurnMessages = (persistUserMessage && userMessage)
    ? [{ role: 'user', content: userMessage }]
    : [];

  while (iteration < MAX_ITER) {
    iteration++;
    const response = await llmClient.chat(messages, tools, agentId);

    messages.push(response);
    memoryStore.appendMessage(memoryId, response);
    if (response.content) {
      newTurnMessages.push({ role: 'assistant', content: response.content });
    }

    if (!response.tool_calls || response.tool_calls.length === 0) {
      if (response.content) {
        log(`[${agentId}] Assistant: ${response.content}`);
        finalContent = response.content;
      }
      break;
    }

    log(`[${agentId}] Executing ${response.tool_calls.length} tool call(s)`);
    const { results, executedCount } = await executeToolCalls(
      response.tool_calls,
      toolExecutors,
      agentId,
      onLog
    );
    totalToolsExecuted += executedCount;

    for (const { callId, result } of results) {
      const toolResultMsg = {
        role: 'tool',
        tool_call_id: callId,
        content: result,
      };
      messages.push(toolResultMsg);
      memoryStore.appendMessage(memoryId, toolResultMsg);
    }
  }

  if (iteration >= MAX_ITER) {
    logErr(`[${agentId}] Max tool call iterations reached`);
  }

  if (persistUserMessage && userMessage && newTurnMessages.length >= 2) {
    const totalChars = newTurnMessages.map(m => m.content || '').join('').length;
    if (totalChars >= 30) {
      setTimeout(() => {
        extractAndSaveMemory(memoryId, newTurnMessages, onLog).catch(err => {
          logErr(`[${agentId}] Memory extraction failed: ${err.message}`);
        });
      }, 0);
    }
  }

  return { content: finalContent, toolCallsMade: totalToolsExecuted > 0 };
}

function extractStoryHooks(agentId) {
  const memories = memoryStore.getAllMemories(agentId);
  return memories
    .filter(m => {
      if (m.importance < 2) return false;
      return ['milestone', 'event', 'emotion'].includes(m.category);
    })
    .slice(-5)
    .sort((a, b) => b.importance - a.importance)
    .map(m => m.content);
}

function buildSystemPromptWithMemory(basePrompt, agentId) {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const memorySummary = memoryStore.getMemorySummary(agentId);

  let prompt = `${basePrompt}\n\n当前时间：${timeStr}`;

  if (memorySummary) {
    prompt += `\n\n${memorySummary}\n\n请自然地将这些回忆融入对话，就像你自己记得的一样，不要生硬地提及"根据记录"之类的表述。`;
  }

  const hooks = extractStoryHooks(agentId);
  if (hooks.length > 0) {
    prompt += `\n\n【潜在剧情钩子】以下是可以用来推进剧情的记忆:\n`;
    hooks.forEach((hook, i) => {
      prompt += `${i + 1}. ${hook}\n`;
    });
    prompt += `\n请主动利用这些钩子创造新的情节发展。`;
  }

  const storySummary = storyStateStore.getSummaryForPrompt(agentId);
  if (storySummary) {
    prompt += `\n\n【当前剧情状态】\n${storySummary}`;
  }

  return prompt;
}

async function extractAndSaveMemory(agentId, turnMessages, onLog = () => {}) {
  const log = (msg) => onLog('info', msg);

  const existingMemories = memoryStore.getAllMemories(agentId).slice(-20);
  const existingSummary = existingMemories.length > 0
    ? existingMemories.map(m => `[${m.category}] ${m.content}`).join('\n')
    : '（尚无记忆）';

  const conversationText = turnMessages
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${(m.content || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}`)
    .join('\n');

  const extractPrompt = `你是 AI 角色的记忆提炼助手。请从以下对话片段中，提取出值得长期记住的信息。

【本次对话】
${conversationText}

【已有记忆（避免重复）】
${existingSummary}

【提取规则】
1. 只提取真正有价值、值得长期记住的信息（用户个人信息、偏好、重要事件、情感时刻、关系节点等）
2. 如果与已有记忆重复或非常相似，不要重复提取
3. 如果本次对话没有值得记住的新信息，返回空数组
4. 每条记忆不超过 60 字，用简洁中文描述
5. importance：1=普通信息，2=重要信息，3=非常重要/关键

【分类说明】
- profile：用户基础信息（名字、年龄、职业、城市等）
- preference：偏好喜好（食物、音乐、颜色、习惯等）
- event：重要事件（发生的具体事情，最好带时间）
- emotion：情感片段（特别的情绪状态、感动时刻）
- milestone：关系里程碑（第一次X、重要纪念日等）

请严格以 JSON 数组格式输出，不要有任何其他文字：
[{"category":"profile","content":"...","importance":2,"sourceDate":"2026-03-14"},...]

如果无值得记住的信息，返回：[]`;

  const messages = [
    { role: 'system', content: '你是记忆提炼助手，只输出 JSON 数组，不输出任何其他内容。' },
    { role: 'user', content: extractPrompt },
  ];

  const activeCfg = llmClient.getActiveProviderConfig();
  let response = await llmClient.chat(messages, [], `${agentId}-memory-extractor`, {
    model: activeCfg.memoryModel || activeCfg.model || 'gpt-4o',
    maxTokens: 512,
  });

  const raw = (response.content || '').trim();
  if (!raw || raw === '[]') return;

  let items = [];
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      items = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      onLog('info', `[${agentId}] Memory extraction JSON parse failed (ignored): ${parseErr.message.slice(0, 80)}`);
      return;
    }
  }

  if (!Array.isArray(items) || items.length === 0) return;

  const saved = memoryStore.bulkUpsertMemories(agentId, items);
  if (saved.length > 0) {
    log(`[${agentId}] 已提炼并保存 ${saved.length} 条长期记忆`);
  }
}

module.exports = { runAgentTurn, buildSystemPromptWithMemory, extractAndSaveMemory, extractStoryHooks };
