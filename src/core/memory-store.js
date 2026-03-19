'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MEMORY_DIR = path.join(__dirname, '../../data/memory');

// 回忆分类常量
const MEMORY_CATEGORIES = {
  PROFILE: 'profile',       // 用户基础信息（名字、职业、年龄等）
  PREFERENCE: 'preference', // 偏好喜好（饮食、音乐、颜色等）
  EVENT: 'event',           // 重要事件（带时间的具体事情）
  EMOTION: 'emotion',       // 情感片段（某次特别的情绪状态）
  MILESTONE: 'milestone',   // 关系里程碑（第一次对话、纪念日等）
};

const CATEGORY_LABELS = {
  profile: '关于你',
  preference: '偏好喜好',
  event: '重要事件',
  emotion: '情感片段',
  milestone: '关系里程碑',
};

function getMemoryPath(agentId) {
  return path.join(MEMORY_DIR, `${agentId}.json`);
}

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function load(agentId) {
  const file = getMemoryPath(agentId);
  if (!fs.existsSync(file)) {
    return { messages: [], facts: [], memories: [] };
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 确保 memories 字段存在（旧数据兼容）
  if (!data.memories) {
    data.memories = [];
  }
  return data;
}

function save(agentId, data) {
  ensureDir();
  fs.writeFileSync(getMemoryPath(agentId), JSON.stringify(data, null, 2), 'utf8');
}

// ──────────────────────────────────────────────
// 短期记忆：对话历史
// ──────────────────────────────────────────────

/**
 * 追加对话消息（保留策略：最近 TAIL 条，截断后做配对清理）
 */
function appendMessage(agentId, message) {
  const mem = load(agentId);
  mem.messages.push({ ...message, timestamp: Date.now() });

  const TAIL = 20; // 只保留最近 20 条（约 6-7 轮对话），减少每次 LLM 调用的 token 消耗
  if (mem.messages.length > TAIL) {
    mem.messages = mem.messages.slice(-TAIL);
  }

  // 清理配对不完整的 tool 消息（防止 400 错误）
  mem.messages = sanitizeToolMessages(mem.messages);

  save(agentId, mem);
}

/**
 * 清理消息列表中配对不完整的 tool_calls / tool 消息
 * - 删除没有对应 tool 结果的 assistant tool_calls（或补空结果）
 * - 删除没有对应 tool_calls 的 tool 消息
 */
function sanitizeToolMessages(messages) {
  // 第一遍：收集所有已有 tool result 的 call_id
  const resolvedCallIds = new Set(
    messages
      .filter(m => m.role === 'tool' && m.tool_call_id)
      .map(m => m.tool_call_id)
  );

  // 第二遍：收集所有 assistant 发出的 call_id
  const issuedCallIds = new Set();
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) issuedCallIds.add(tc.id);
    }
  }

  const cleaned = [];
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      // 过滤掉没有对应 tool result 的 tool_calls
      const validCalls = m.tool_calls.filter(tc => resolvedCallIds.has(tc.id));
      if (validCalls.length === 0) {
        // 所有 tool_calls 都没结果 → 把这条 assistant 消息保留但去掉 tool_calls
        // 这样至少保留了文字内容（如果有的话）
        const stripped = { ...m };
        delete stripped.tool_calls;
        if (stripped.content) cleaned.push(stripped);
        // 没有文字内容的纯 tool_calls 消息直接丢弃
      } else if (validCalls.length < m.tool_calls.length) {
        // 部分 tool_calls 有结果：只保留有结果的那些
        cleaned.push({ ...m, tool_calls: validCalls });
      } else {
        cleaned.push(m);
      }
    } else if (m.role === 'tool') {
      // 只保留有对应 tool_calls 的 tool 消息
      if (issuedCallIds.has(m.tool_call_id)) {
        cleaned.push(m);
      }
      // 否则静默丢弃
    } else {
      cleaned.push(m);
    }
  }
  return cleaned;
}

/**
 * 获取对话历史（OpenAI 格式，不含 timestamp，已做配对清理）
 */
function getMessages(agentId) {
  const mem = load(agentId);
  const raw = mem.messages.map(({ role, content, tool_calls, tool_call_id }) => {
    const m = { role, content: content || null };
    if (tool_calls) m.tool_calls = tool_calls;
    if (tool_call_id) m.tool_call_id = tool_call_id;
    return m;
  });
  // 兜底：返回前再过一遍配对清理，防止旧数据遗留问题
  return sanitizeToolMessages(raw);
}

function clearMessages(agentId) {
  const mem = load(agentId);
  mem.messages = [];
  save(agentId, mem);
}

/**
 * 清空所有记忆（短期对话历史 + 长期结构化记忆 + 旧版 facts）
 * 用于用户主动要求"清空记忆/忘掉一切"的场景
 */
function clearAllMemory(agentId) {
  const mem = load(agentId);
  mem.messages = [];
  mem.memories = [];
  mem.facts = [];
  save(agentId, mem);
}

// ──────────────────────────────────────────────
// 长期记忆：结构化 memories[]
// ──────────────────────────────────────────────

/**
 * 新增或更新一条结构化回忆
 * @param {string} agentId
 * @param {Object} memory - { category, content, importance?, sourceDate? }
 */
function upsertMemory(agentId, memory) {
  const mem = load(agentId);

  const entry = {
    id: uuidv4(),
    category: memory.category || MEMORY_CATEGORIES.EVENT,
    content: (memory.content || '').slice(0, 200), // 最多200字
    importance: Math.min(3, Math.max(1, memory.importance || 2)),
    sourceDate: memory.sourceDate || new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  };

  mem.memories.push(entry);
  save(agentId, mem);
  return entry;
}

/**
 * 批量写入回忆（提炼 LLM 的输出）
 * @param {string} agentId
 * @param {Array} items - [{ category, content, importance, sourceDate }]
 */
function bulkUpsertMemories(agentId, items) {
  if (!items || items.length === 0) return [];
  const mem = load(agentId);
  const added = [];

  for (const item of items) {
    if (!item.content || item.content.trim().length < 4) continue;
    const entry = {
      id: uuidv4(),
      category: item.category || MEMORY_CATEGORIES.EVENT,
      content: item.content.trim().slice(0, 200),
      importance: Math.min(3, Math.max(1, item.importance || 2)),
      sourceDate: item.sourceDate || new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
    };
    mem.memories.push(entry);
    added.push(entry);
  }

  save(agentId, mem);
  return added;
}

/**
 * 删除一条回忆
 */
function deleteMemory(agentId, memoryId) {
  const mem = load(agentId);
  const before = mem.memories.length;
  mem.memories = mem.memories.filter(m => m.id !== memoryId);
  save(agentId, mem);
  return mem.memories.length < before;
}

/**
 * 获取所有回忆（按 category 分组）
 */
function getAllMemories(agentId) {
  const mem = load(agentId);
  return mem.memories || [];
}

/**
 * 按关键词搜索回忆
 */
function searchMemory(agentId, keyword) {
  const mem = load(agentId);
  if (!keyword) return mem.memories;
  const kw = keyword.toLowerCase();
  return mem.memories.filter(m =>
    m.content.toLowerCase().includes(kw) ||
    CATEGORY_LABELS[m.category]?.includes(kw)
  );
}

/**
 * 生成注入 system prompt 的回忆摘要（紧凑格式，约 400-800 token）
 */
function getMemorySummary(agentId) {
  const mem = load(agentId);
  const memories = mem.memories || [];

  // 兼容旧 facts[]：将 facts 作为 preference 类归入摘要
  const legacyFacts = (mem.facts || []).slice(-10).map(f =>
    typeof f === 'string' ? f : f.fact
  );

  if (memories.length === 0 && legacyFacts.length === 0) {
    return null;
  }

  // 按 category 分组，每组取重要程度最高的前5条
  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  const lines = ['【我的回忆】'];

  const categoryOrder = ['profile', 'milestone', 'preference', 'event', 'emotion'];
  for (const cat of categoryOrder) {
    const items = (grouped[cat] || [])
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 6);
    if (items.length === 0) continue;

    lines.push(`· ${CATEGORY_LABELS[cat] || cat}：${items.map(i => i.content).join('；')}`);
  }

  if (legacyFacts.length > 0) {
    lines.push(`· 其他记录：${legacyFacts.join('；')}`);
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────
// 旧版 facts API（兼容保留）
// ──────────────────────────────────────────────

function addFact(agentId, fact) {
  const mem = load(agentId);
  mem.facts = mem.facts || [];
  mem.facts.push({ fact, timestamp: Date.now() });
  if (mem.facts.length > 100) mem.facts = mem.facts.slice(-100);
  save(agentId, mem);

  // 同时写入结构化 memories
  upsertMemory(agentId, {
    category: MEMORY_CATEGORIES.PREFERENCE,
    content: fact,
    importance: 2,
  });
}

function getFacts(agentId) {
  return load(agentId).facts || [];
}

module.exports = {
  // 短期记忆
  appendMessage,
  getMessages,
  clearMessages,
  clearAllMemory,
  // 长期记忆（结构化）
  upsertMemory,
  bulkUpsertMemories,
  deleteMemory,
  getAllMemories,
  searchMemory,
  getMemorySummary,
  // 旧版兼容
  addFact,
  getFacts,
  // 常量
  MEMORY_CATEGORIES,
  CATEGORY_LABELS,
};
