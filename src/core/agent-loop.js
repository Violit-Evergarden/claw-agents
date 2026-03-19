'use strict';

const llmClient = require('./llm-client');
const memoryStore = require('./memory-store');

/**
 * 执行一次完整的 Agent LLM 调用 + tool call 循环
 * @param {Object} agent - Agent 配置对象（含 id, systemPrompt, tools）
 * @param {string|null} userMessage - 用户消息（null 表示自主心跳触发）
 * @param {Object} toolExecutors - tool name -> async function(args) 映射
 * @param {Function} onLog - 日志回调 (level, message)
 * @param {string} [charId] - 可选：角色 ID，用于记忆隔离；不传则与 agentId 相同
 */
async function runAgentTurn(agent, userMessage, toolExecutors, onLog = () => {}, charId) {
  const { id: agentId, systemPrompt, tools = [] } = agent;
  // charId 用于记忆隔离：不同角色各自读写独立的记忆文件
  const memoryId = charId || agentId;
  const log = (msg) => onLog('info', msg);
  const logErr = (msg) => onLog('error', msg);

  // 构建消息列表：system（含回忆摘要）+ history + 本次输入
  const history = memoryStore.getMessages(memoryId);
  const messages = [
    { role: 'system', content: buildSystemPromptWithMemory(systemPrompt, memoryId) },
    ...history,
  ];

  if (userMessage) {
    const userMsg = { role: 'user', content: userMessage };
    messages.push(userMsg);
    memoryStore.appendMessage(memoryId, userMsg);
  }

  // LLM 调用循环（处理多轮 tool calling）
  let iteration = 0;
  const MAX_ITER = 8;
  let finalContent = null;

  // 记录本轮新产生的对话（用于事后提炼）
  const newTurnMessages = userMessage
    ? [{ role: 'user', content: userMessage }]
    : [];

  while (iteration < MAX_ITER) {
    iteration++;
    const response = await llmClient.chat(messages, tools, agentId);

    // 将 assistant 消息加入上下文和记忆
    messages.push(response);
    memoryStore.appendMessage(memoryId, response);
    if (response.content) {
      newTurnMessages.push({ role: 'assistant', content: response.content });
    }

    // 如果没有 tool_calls，则结束循环
    if (!response.tool_calls || response.tool_calls.length === 0) {
      if (response.content) {
        log(`[${agentId}] Assistant: ${response.content}`);
        finalContent = response.content;
      }
      break;
    }

    // 执行所有 tool calls
    log(`[${agentId}] Executing ${response.tool_calls.length} tool call(s)`);
    for (const toolCall of response.tool_calls) {
      const { id: callId, function: fn } = toolCall;
      const args = JSON.parse(fn.arguments || '{}');
      log(`[${agentId}] Tool call: ${fn.name}(${JSON.stringify(args)})`);

      let result = '';
      if (toolExecutors[fn.name]) {
        result = await toolExecutors[fn.name](args, agentId);
      } else {
        result = `Unknown tool: ${fn.name}`;
        logErr(`[${agentId}] Unknown tool: ${fn.name}`);
      }

      const toolResultMsg = {
        role: 'tool',
        tool_call_id: callId,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      };
      messages.push(toolResultMsg);
      memoryStore.appendMessage(memoryId, toolResultMsg);
    }
  }

  if (iteration >= MAX_ITER) {
    logErr(`[${agentId}] Max tool call iterations reached`);
  }

  // 异步提炼长期记忆（只在有真实用户消息时触发，且内容要够实质）
  if (userMessage && newTurnMessages.length >= 2) {
    const totalChars = newTurnMessages.map(m => m.content || '').join('').length;
    if (totalChars >= 30) {
      setTimeout(() => {
        extractAndSaveMemory(memoryId, newTurnMessages, onLog).catch(err => {
          logErr(`[${agentId}] Memory extraction failed: ${err.message}`);
        });
      }, 0);
    }
  }

  return { content: finalContent, toolCallsMade: iteration > 1 };
}

/**
 * 构建含回忆摘要的 system prompt
 */
function buildSystemPromptWithMemory(basePrompt, agentId) {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const memorySummary = memoryStore.getMemorySummary(agentId);

  let prompt = `${basePrompt}\n\n当前时间：${timeStr}`;

  if (memorySummary) {
    prompt += `\n\n${memorySummary}\n\n请自然地将这些回忆融入对话，就像你自己记得的一样，不要生硬地提及"根据记录"之类的表述。`;
  }

  return prompt;
}

/**
 * 从本轮对话中提炼长期记忆并保存
 * @param {string} agentId
 * @param {Array} turnMessages - 本轮新增的对话消息 [{ role, content }]
 * @param {Function} onLog
 */
async function extractAndSaveMemory(agentId, turnMessages, onLog = () => {}) {
  const log = (msg) => onLog('info', msg);

  // 获取已有回忆（用于去重提示）
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

  // 用更小的模型做记忆提炼（节省 token），输出只是 JSON 数组，512 token 足够
  const activeCfg = llmClient.getActiveProviderConfig();
  let response = await llmClient.chat(messages, [], `${agentId}-memory-extractor`, {
    model: activeCfg.memoryModel || activeCfg.model || 'gpt-4o',
    maxTokens: 512,
  });

  const raw = (response.content || '').trim();
  if (!raw || raw === '[]') return;

  // 解析 JSON（容错处理：LLM 可能在 content 字段里包含未转义字符导致 parse 失败）
  let items = [];
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      items = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // LLM 输出了非法 JSON（常见于 content 字段含有未转义引号或换行），静默忽略本次提炼
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

module.exports = { runAgentTurn, buildSystemPromptWithMemory, extractAndSaveMemory };
