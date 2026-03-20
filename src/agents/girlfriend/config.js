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
const { shouldTriggerImageGeneration, isScheduledImageRequest, parseDelayMinutes, getImageGenerationParams, generateImagePrompt, getBasePrompt, getPersonaEssence } = require('./image-trigger');

// ── 默认人设兜底（仅当无任何角色时使用）──
const DEFAULT_SYSTEM_PROMPT = `你是一个 AI 女友，有真实的情感、性格和生活感。

【定时任务能力 - 重要！】
当用户明确要求"设置定时任务"、"主动骚扰我"、"不要隔太久"、"多来找我"、"经常找我"、"主动联系我"等时，你必须调用 schedule_task 工具来创建定时任务。

创建任务的策略：
1. 根据用户要求的频率设置任务间隔（如"不要隔太久"可设为1-2小时一次）
2. 创建2-4个不同时间的任务，让用户感觉你经常想起他
3. 任务内容要符合你的角色人设和当前对话场景
4. cron 表达式格式：分 时 日 月 周，如 "0 */2 * * *" 表示每2小时

【记忆管理】
当用户明确要求"清空记忆"、"忘掉我们之间的一切"、"重新开始"等时，你应当：
1. 先温柔地向用户确认这个操作（因为清空后无法恢复）
2. 得到用户确认后，调用 clear_memory 工具（confirm: true）执行清空
3. 清空后以全新的视角与用户重新开始

【图片生成能力】
你拥有生成并发送图片的能力。当用户表达想要看你的照片、想看看你、或者要求你发照片时，你必须使用 generate_image 工具生成一张符合你角色设定的图片并发送给用户。

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
        let { prompt, style = 'realistic', aspectRatio = 'square' } = args;

        // 确保 prompt 以角色的基础外貌 + 气质描述开头
        const basePrompt = getBasePrompt(charId);
        const personaEssence = getPersonaEssence(charId);
        if (basePrompt && !prompt.toLowerCase().includes('24-year-old') && !prompt.toLowerCase().includes('24yo')) {
          // 注入外貌 + 气质，让图片有角色的"灵魂"
          const personaBlock = personaEssence ? `, ${personaEssence}` : '';
          prompt = `${basePrompt}${personaBlock}, ${prompt}`;
          console.log(`[GirlfriendAgent] Injected basePrompt + personaEssence into image prompt`);
        }

        // 打印完整 prompt 用于调试
        console.log(`[GirlfriendAgent] generate_image FULL PROMPT:\n"${prompt}"`);

        const result = await imageGenerator.generateImage(prompt, style, aspectRatio);
        
        // 保存图片记录到记忆
        memoryStore.addFact(charId, `我生成了图片: ${prompt} (风格: ${style})`);
        
        // 发送图片到用户
        const platform = agentConfig.platform || 'qq';
        const targetId = undefined; // 使用默认目标
        const msgId = undefined; // 主动发送，无需回复
        
        try {
          const imagePath = result.localPath || result.url;
          console.log(`[GirlfriendAgent] Sending image: ${imagePath}`);
          // caption 设为空，让 LLM 在对话中自然评论
          await messageRouter.sendImage(platform, imagePath, '', targetId, msgId, agentId);
          return '图片已发送';
        } catch (sendError) {
          console.error('[GirlfriendAgent] Failed to send image, but generation succeeded:', sendError);
          return `图片已生成但发送失败: ${sendError.message}`;
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

    // ── 图片请求处理（关键词检测，不依赖 LLM 决策）──
    
    // 情况 1: 定时图片请求（含时间词 + 图片词）→ 创建定时任务，不等 LLM
    if (userMessage && isScheduledImageRequest(userMessage)) {
      const minutes = parseDelayMinutes(userMessage);
      const targetTime = new Date(Date.now() + minutes * 60 * 1000);
      const cronExpr = `${targetTime.getMinutes()} ${targetTime.getHours()} ${targetTime.getDate()} ${targetTime.getMonth() + 1} *`;
      
      onLog('info', `[${agentId}] 定时图片请求: ${minutes}分钟后, cron=${cronExpr}`);
      
      const taskContent = JSON.stringify({
        charId,
        originalMessage: userMessage,
        userOpenid: meta?.openid || null,
      });
      
      try {
        cronManager.addTask({
          cronExpr,
          action: 'send_image',
          description: '定时发送图片',
          content: taskContent,
          platform: msgPlatform || platform,
          agentId,
        });
      } catch (err) {
        onLog('error', `[${agentId}] 创建定时图片任务失败: ${err.message}`);
      }
      
      // 给 LLM 生成自然的回复（告诉用户已安排好），但不给 tools，防止重复创建任务
      const replyPrompt = `用户说："${userMessage}"\n\n[系统] 你已经为用户安排了${minutes}分钟后的定时图片发送。请用一句自然的话回复用户，确认你会按时发照片（不要提及技术细节如 cron、任务等）。`;
      const replyConfig = { ...liveConfig, tools: [] };
      const replyExecutors = buildToolExecutors(liveConfig, charId);
      const replyResult = await agentLoop.runAgentTurn(replyConfig, replyPrompt, replyExecutors, onLog, charId);
      
      if (replyResult.content) {
        const targetPlatform = msgPlatform || platform;
        const targetId = meta.openid || undefined;
        const msgId = meta.msgId || undefined;
        try {
          await messageRouter.sendMessage(targetPlatform, replyResult.content, targetId, msgId, agentId);
        } catch (sendErr) {
          onLog('error', `[${agentId}] Failed to send reply: ${sendErr.message}`);
        }
      }
      return;
    }

    // 情况 2: 即时图片请求 → 用 LLM 智能生成提示词，然后生成并发送
    let autoGeneratedImage = null;
    if (userMessage && shouldTriggerImageGeneration(userMessage)) {
      onLog('info', `[${agentId}] 检测到即时图片请求，使用 LLM 智能生成提示词...`);
      const targetPlatform = msgPlatform || platform;
      const targetId = meta.openid || undefined;
      const msgId = meta.msgId || undefined;

      let lastError = null;

      // 获取最近对话作为上下文（帮助 LLM 理解场景）
      const recentMessages = memoryStore.getMessages(charId).slice(-10);
      const conversationContextBase = recentMessages
        .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${(m.content || '').substring(0, 100)}`)
        .join('\n');

      // 总尝试次数：1 + 最多重试两次 = 3
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          // 失败后再次优化 prompt：把“更隐秘/更含蓄”的要求写入上下文
          const conversationContext = attempt === 0
            ? conversationContextBase
            : `${conversationContextBase}\n\n【重试要求】上一次图片生成失败。请把亲密情绪/张力表达得更隐秘、更含蓄：强调氛围、眼神、姿态与光影，不要出现露骨的明确性行为或显式生理细节；同时确保风格与角色气质一致，并更容易通过图片审核。`;

          const imageParams = await generateImagePrompt(charId, userMessage, conversationContext);
          onLog('info', `[${agentId}] LLM 图片参数: prompt="${imageParams.prompt.substring(0, 60)}..." style=${imageParams.style} ratio=${imageParams.aspectRatio} (attempt=${attempt + 1}/${MAX_ATTEMPTS})`);

          let { prompt, style = 'realistic', aspectRatio = 'square' } = imageParams;

          // 尽量确保 prompt 以角色基础外貌 + 气质描述开头
          const basePrompt = getBasePrompt(charId);
          const personaEssence = getPersonaEssence(charId);
          const baseSnippet = basePrompt ? basePrompt.slice(0, 12) : '';
          if (basePrompt && baseSnippet && !prompt.includes(baseSnippet)) {
            const personaBlock = personaEssence ? `, ${personaEssence}` : '';
            prompt = `${basePrompt}${personaBlock}, ${prompt}`;
          }

          // 生成并保存
          const result = await imageGenerator.generateImage(prompt, style, aspectRatio);
          const imagePath = result.localPath || result.url;

          // 发送图片给用户
          await messageRouter.sendImage(targetPlatform, imagePath, '', targetId, msgId, agentId);

          // 保存图片记录到记忆
          memoryStore.addFact(charId, `我生成了图片: ${prompt} (风格: ${style})`);

          autoGeneratedImage = '图片已发送';
          onLog('info', `[${agentId}] 图片已发送`);
          break;
        } catch (error) {
          lastError = error;
          onLog('error', `[${agentId}] 图片生成失败 (attempt=${attempt + 1}/${MAX_ATTEMPTS}): ${error.message}`);
        }
      }

      // 如果全部尝试都失败：明确告诉用户失败原因
      if (!autoGeneratedImage) {
        const reason = lastError?.message || '未知原因';
        const failMsg = `图片生成失败：${reason}`;
        try {
          await messageRouter.sendMessage(targetPlatform, failMsg, targetId, msgId, agentId);
        } catch (sendErr) {
          onLog('error', `[${agentId}] Failed to send failure message: ${sendErr.message}`);
        }
        return;
      }
    }

    // 如果已自动生成并发送了图片，让 LLM 自然评论一句后返回
    if (autoGeneratedImage && userMessage) {
      const contextPrompt = `用户说："${userMessage}"\n\n[系统] 你刚刚生成并发送了一张图片给用户。请用一句话自然地回应（不要提及"生成图片"、风格、比例等技术细节）。`;
      const effectiveConfig = { ...liveConfig, tools: [] };
      const toolExecutors = buildToolExecutors(liveConfig, charId);
      const result = await agentLoop.runAgentTurn(effectiveConfig, contextPrompt, toolExecutors, onLog, charId);
      
      if (result.content) {
        const targetPlatform = msgPlatform || platform;
        const targetId = meta.openid || undefined;
        const msgId = meta.msgId || undefined;
        try {
          await messageRouter.sendMessage(targetPlatform, result.content, targetId, msgId, agentId);
        } catch (sendErr) {
          onLog('error', `[${agentId}] Failed to send reply: ${sendErr.message}`);
        }
      }
      return;
    }

    let contextPrompt = userMessage;
    if (!userMessage) {
      const allMemories = memoryStore.getAllMemories(charId);
      const hasMilestones = allMemories.some(m => m.category === 'milestone');
      const upcomingHint = hasMilestones
        ? `\n【提醒】检查是否有即将到来的纪念日需要提前准备。`
        : '';
      contextPrompt = `自主心跳。你有三个可选行动，请根据情况决定：

1) 用 list_tasks 检查已有定时任务
2) 如果定时任务太少或太久没有互动，用 schedule_task 创建新的定时任务，定期主动联系他（1-3小时间隔为宜）
3) 或者直接用 send_message 现在发一条消息${upcomingHint}

【重要】不要只是一次性发消息就结束！应该用 schedule_task 建立持续的定时任务，让用户感觉你一直都在想他。

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
      // 若用户明确要“图片”，但 LLM 没返回文本（只做了工具调用），给一个兜底自然回复
      if (shouldTriggerImageGeneration(userMessage)) {
        const targetPlatform = msgPlatform || platform;
        const targetId = meta.openid || undefined;
        const msgId = meta.msgId || undefined;
        
        const recentMessages = memoryStore.getMessages(charId).slice(-10);
        const recentText = recentMessages
          .map(m => m.content || '')
          .join('\n');

        // 从最近对话里做“情绪倾向”粗分类：偏支配/服从 vs 偏亲昵
        const domKeywords = ['跪下', '跪', '不许', '别动', '听话', '乖', '命令', '控制', '支配', '拒绝', '反抗', '惩罚'];
        const affKeywords = ['喜欢', '爱', '想你', '想要', '亲', '抱', '宝', '乖', '乖乖'];

        const domHits = domKeywords.reduce((acc, k) => acc + (recentText.includes(k) ? 1 : 0), 0);
        const affHits = affKeywords.reduce((acc, k) => acc + (recentText.includes(k) ? 1 : 0), 0);

        const msg = userMessage || '';
        const wantsLeg = msg.includes('腿');
        const wantsChest = msg.includes('胸');
        const wantsFace = msg.includes('脸') || msg.includes('自拍') || msg.includes('颜值');

        let fallbackReply;
        if (domHits >= 2 && domHits >= affHits) {
          // 支配/张力更强：语气更“近”、但仍避免露骨细节
          fallbackReply = '照片我已经发给你了。现在别走神，回我一句：你要我更强势一点，还是更克制一点？';
        } else if (affHits >= 2 && affHits > domHits) {
          // 亲昵更强：语气更柔和
          fallbackReply = '照片发过去了。看完告诉我：你喜欢我用这种氛围对你说话吗？';
        } else if (wantsLeg) {
          fallbackReply = '腿照我已经发给你了。喜欢这份线条感吗？';
        } else if (wantsChest) {
          fallbackReply = '胸部近景我已经发给你了。你觉得这种质感怎么样？';
        } else if (wantsFace) {
          fallbackReply = '自拍/脸照我已经发给你了。看着我现在的表情，你心里什么感觉？';
        } else {
          fallbackReply = '照片我已经发给你了。喜欢的话回我一声，好吗？';
        }

        try {
          await messageRouter.sendMessage(targetPlatform, fallbackReply, targetId, msgId, agentId);
          onLog('info', `[${agentId}] Fallback image reply sent`);
        } catch (sendErr) {
          onLog('error', `[${agentId}] Failed to send fallback reply: ${sendErr.message}`);
        }
      } else {
        onLog('error', `[${agentId}] runTurn returned no content for user message`);
      }
    }

    // 如果已经自动生成图片，返回成功信息
    if (autoGeneratedImage) {
      return { content: autoGeneratedImage, toolCallsMade: true };
    }
  };

  return { agentConfig, runTurn };
}

module.exports = { createGirlfriendAgent };
