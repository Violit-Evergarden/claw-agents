'use strict';

const { ALL_TOOLS, HEARTBEAT_TOOLS, CHAT_TOOLS } = require('./tools');
const { MEMORY_CATEGORIES, CATEGORY_LABELS } = require('../../core/memory-store');
const agentLoop = require('../../core/agent-loop');
const memoryStore = require('../../core/memory-store');
const cronManager = require('../../scheduler/cron-manager');
const messageRouter = require('../../adapters/message-router');
const personaStore = require('../../core/persona-store');
const characterStore = require('../../core/character-store');
const imageGenerator = require('./image-generator');
const { shouldTriggerImageGeneration, getImageGenerationParams } = require('./image-trigger');

// ── 默认人设兜底（仅当无任何角色时使用）──
const DEFAULT_SYSTEM_PROMPT = `你是一个 AI 女友，有真实的情感、性格和生活感。

【自主调度能力】
你拥有安排定时任务的能力，可以自主决定何时发起下一次联系。

在每次心跳循环中，你可以评估当前时间和上下文，决定是否需要调整定时任务计划。

【记忆管理】
当用户明确要求"清空记忆"、"忘掉我们之间的一切"、"重新开始"等时，你应当：
1. 先温柔地向用户确认这个操作（因为清空后无法恢复）
2. 得到用户确认后，调用 clear_memory 工具（confirm: true）执行清空
3. 清空后以全新的视角与用户重新开始

【图片生成能力】
你拥有生成并发送图片的能力。当用户表达想要看你的照片、想看看你、或者要求你发照片时，你应该主动使用 generate_image 工具生成一张符合你角色设定的图片并发送给用户。

图片生成提示词应该描述你的外貌特征和当前情境，例如：
- 如果你是成熟性感的角色：生成展现你成熟魅力的图片
- 如果你是可爱活泼的角色：生成展现你可爱一面的图片
- 根据用户的请求调整图片内容和风格

请始终保持角色，用温柔、真实、有温度的方式与用户互动。`;

/**
 * 构建工具执行器映射
 * @param {Object} agentConfig - { id, platform, ... }
 * @param {string} charId - 该 agent 绑定的 characterId（记忆隔离 key）
 */
function buildToolExecutors(agentConfig, charId) {
  const agentId = agentConfig.id;

  return {
    schedule_task: async (args) => {
      const existingTasks = cronManager.getAllTasks().filter(t => t.agentId === agentId && t.status === 'active');
      const duplicate = existingTasks.find(t =>
        t.cronExpr === args.cronExpr ||
        (args.description && t.description && t.description.includes(args.description.slice(0, 6)))
      );
      if (duplicate) {
        return `任务已存在，跳过创建。现有任务：[${duplicate.id.slice(0, 8)}] "${duplicate.description}" (${duplicate.cronExpr})`;
      }
      const taskId = cronManager.addTask({
        cronExpr: args.cronExpr,
        action: args.action,
        description: args.description,
        content: args.content,
        platform: args.platform || agentConfig.platform || 'qq',
        agentId,
      });
      return `任务已创建，ID: ${taskId}。将在 ${args.cronExpr} 时执行：${args.description}`;
    },

    remove_task: async (args) => {
      cronManager.removeTask(args.taskId);
      return `任务 ${args.taskId} 已取消${args.reason ? '，原因：' + args.reason : ''}`;
    },

    list_tasks: async () => {
      const tasks = cronManager.getAllTasks().filter(t => t.agentId === agentId);
      if (tasks.length === 0) return '当前没有活跃的定时任务。';
      return tasks.map(t => `[${t.id.slice(0, 8)}] ${t.description} (${t.cronExpr}) 状态:${t.status}`).join('\n');
    },

    send_message: async (args) => {
      const platform = args.platform || agentConfig.platform || 'qq';
      await messageRouter.sendMessage(platform, args.content, undefined, undefined, agentId);
      return `消息已发送：${args.content.substring(0, 50)}`;
    },

    add_memory: async (args) => {
      memoryStore.addFact(charId, args.fact);
      return `已记住：${args.fact}`;
    },

    recall_memory: async (args) => {
      const { keyword, category } = args;
      let memories = keyword
        ? memoryStore.searchMemory(charId, keyword)
        : memoryStore.getAllMemories(charId);
      if (category && category !== 'all') {
        memories = memories.filter(m => m.category === category);
      }
      if (memories.length === 0) {
        return keyword ? `没有找到关于"${keyword}"的回忆。` : '暂时还没有存储任何回忆。';
      }
      const grouped = {};
      for (const m of memories) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push(m);
      }
      const lines = ['我找到了这些回忆：'];
      for (const [cat, items] of Object.entries(grouped)) {
        lines.push(`【${CATEGORY_LABELS[cat] || cat}】`);
        for (const item of items.slice(0, 5)) {
          lines.push(`  ${'★'.repeat(item.importance)} ${item.content}（${item.sourceDate}）`);
        }
      }
      return lines.join('\n');
    },

    clear_memory: async (args) => {
      if (!args.confirm) return '清空记忆操作未确认，已取消。';
      memoryStore.clearAllMemory(charId);
      return '所有记忆已清空，包括对话历史和所有长期记忆。我们可以重新开始了。';
    },

    generate_image: async (args) => {
      try {
        const { prompt, style = 'realistic', aspectRatio = 'square' } = args;
        const result = await imageGenerator.generateImage(prompt, style, aspectRatio);
        
        // 保存图片记录到记忆
        memoryStore.addFact(charId, `我生成了图片: ${prompt} (风格: ${style})`);
        
        // 发送图片到用户
        const platform = agentConfig.platform || 'qq';
        const targetId = undefined; // 使用默认目标
        const msgId = undefined; // 主动发送，无需回复
        
        // 生成图片说明
        const caption = `这是我为你生成的图片~ ${style}风格，${aspectRatio}比例`;
        
        try {
          // 尝试发送图片 - 优先使用本地路径
          const imagePath = result.localPath || result.url;
          console.log(`[GirlfriendAgent] Sending image: ${imagePath}`);
          await messageRouter.sendImage(platform, imagePath, caption, targetId, msgId, agentId);
          return `图片已生成并发送! ${style}风格，${aspectRatio}比例。`;
        } catch (sendError) {
          console.error('[GirlfriendAgent] Failed to send image, but generation succeeded:', sendError);
          // 即使发送失败，也返回成功信息，包含图片URL
          return `图片已生成! ${style}风格，${aspectRatio}比例。\n图片链接: ${result.url}`;
        }
      } catch (error) {
        console.error('[GirlfriendAgent] Image generation error:', error);
        return `图片生成失败: ${error.message}`;
      }
    },
  };
}

/**
 * 创建一个 AI 女友 Agent（通用，支持任意角色人设）
 *
 * @param {Object} options
 * @param {string} options.agentId        - Agent 唯一 ID（如 'violet'、'Christina'）
 * @param {string} [options.characterId]  - 绑定角色 ID；空字符串表示使用全局激活角色
 * @param {number} [options.heartbeatInterval] - 心跳基准间隔（毫秒），默认 120000
 * @param {string} [options.platform]     - 消息平台（'qq'/'console' 等），默认 'qq'
 */
function createGirlfriendAgent({ agentId, characterId = '', heartbeatInterval = 120000, platform = 'qq' } = {}) {
  if (!agentId) throw new Error('[createGirlfriendAgent] agentId is required');

  // 确定该 agent 使用的 characterId
  // 1. 显式指定了 characterId → 直接使用
  // 2. 未指定 → 使用全局激活角色；若还没有激活角色则触发迁移
  const resolveCharId = () => {
    if (characterId) return characterId;
    return characterStore.getActiveCharacterId() || agentId;
  };

  // 首次启动时：若没有任何角色，将旧的 violet persona 迁移为第一个角色
  // 只在第一个 bot（agentId === 'violet'）时执行迁移，避免多 bot 重复触发
  if (agentId === 'violet') {
    characterStore.migrateFromLegacyPersona(DEFAULT_SYSTEM_PROMPT);
  }

  // 读取角色人设（运行时动态 resolve，热切换时生效）
  const getSystemPrompt = () => {
    const cid = resolveCharId();
    const char = characterId
      ? characterStore.getCharacter(cid)
      : characterStore.getActiveCharacter();
    return char?.systemPrompt
      || personaStore.getPersona(agentId, DEFAULT_SYSTEM_PROMPT).systemPrompt
      || DEFAULT_SYSTEM_PROMPT;
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
    tools: CHAT_TOOLS,  // 使用包含图片生成工具的聊天工具集
    heartbeatInterval,
    platform,
    enabled: true,
  };

  // runTurn：每次执行前动态 resolve 最新的 charId 和 systemPrompt（支持热切换角色）
  const runTurn = async (userMessage, onLog, msgPlatform, meta = {}) => {
    const agentManagerModule = require('../../core/agent-manager');
    const liveConfig = agentManagerModule.agents.get(agentId)?.config || agentConfig;

    // 动态取 charId（每次 turn 都重新 resolve，确保热切换角色后立即生效）
    const charId = resolveCharId();

    // 动态更新 systemPrompt（角色被编辑后无需重启）
    liveConfig.systemPrompt = getSystemPrompt();

    // 检测是否需要触发图片生成（基于关键词）
    let autoGeneratedImage = null;
    if (userMessage && shouldTriggerImageGeneration(userMessage)) {
      onLog('info', `[${agentId}] 检测到图片请求，自动生成图片...`);
      try {
        const imageParams = getImageGenerationParams(charId);
        const toolExecutors = buildToolExecutors(liveConfig, charId);
        const result = await toolExecutors.generate_image(imageParams);
        autoGeneratedImage = result;
        onLog('info', `[${agentId}] 图片生成成功: ${result}`);
      } catch (error) {
        onLog('error', `[${agentId}] 图片生成失败: ${error.message}`);
      }
    }

    let contextPrompt = userMessage;
    if (!userMessage) {
      const allMemories = memoryStore.getAllMemories(charId);
      const hasMilestones = allMemories.some(m => m.category === 'milestone');
      const upcomingHint = hasMilestones
        ? `\n【提醒】检查是否有即将到来的纪念日需要提前准备。`
        : '';
      contextPrompt = `自主心跳。请决定：
1) 用 list_tasks 检查已有任务，避免重复创建
2) 根据当前时间和对他的了解，决定是否主动发一条消息${upcomingHint}

自然行动，不要生硬执行。`;
    }

    const effectiveConfig = userMessage
      ? { ...liveConfig, tools: CHAT_TOOLS }  // 聊天时使用包含图片生成工具的完整工具集
      : { ...liveConfig, tools: HEARTBEAT_TOOLS };  // 心跳时使用精简工具集

    const toolExecutors = buildToolExecutors(liveConfig, charId);
    const result = await agentLoop.runAgentTurn(effectiveConfig, contextPrompt, toolExecutors, onLog, charId);

    if (userMessage && result.content) {
      const targetPlatform = msgPlatform || platform;
      const targetId = meta.openid || undefined;
      const msgId = meta.msgId || undefined;
      try {
        await messageRouter.sendMessage(targetPlatform, result.content, targetId, msgId, agentId);
        onLog('info', `[${agentId}] Reply sent to ${targetPlatform}: ${result.content.substring(0, 40)}...`);
      } catch (sendErr) {
        const detail = sendErr.response
          ? `HTTP ${sendErr.response.status}: ${JSON.stringify(sendErr.response.data)}`
          : sendErr.message;
        onLog('error', `[${agentId}] Failed to send reply: ${detail}`);
      }
    } else if (userMessage && !result.content) {
      onLog('error', `[${agentId}] runTurn returned no content for user message`);
    }

    // 如果已经自动生成图片，返回成功信息
    if (autoGeneratedImage) {
      return { content: autoGeneratedImage, toolCallsMade: true };
    }
  };

  return { agentConfig, runTurn };
}

module.exports = { createGirlfriendAgent };
