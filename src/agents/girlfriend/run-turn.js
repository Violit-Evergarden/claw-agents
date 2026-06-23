'use strict';

const { getChatTools, getHeartbeatTools } = require('./tools');
const { isSchedulerEnabled } = require('../../core/config-loader');
const { CATEGORY_LABELS } = require('../../core/memory-store');
const agentLoop = require('../../core/agent-loop');
const memoryStore = require('../../core/memory-store');
const cronManager = require('../../scheduler/cron-manager');
const messageRouter = require('../../adapters/message-router');
const storyStateStore = require('../../core/story-state-store');
const imageGenerator = require('./image-generator');
const { getBasePrompt, getPersonaEssence } = require('./image-trigger');
const imagePipeline = require('./image-pipeline');
const { buildHeartbeatPrompt } = require('./heartbeat-prompt');
const { buildImageFallbackReply } = require('./reply-fallback');
const { sendTextReply } = require('../../core/reply-dispatcher');

function buildToolExecutors(agentConfig, charId) {
  const agentId = agentConfig.id;

  return {
    schedule_task: async () => {
      return '定时任务功能已暂时禁用，无法创建新任务。';
    },

    remove_task: async (args) => {
      if (!isSchedulerEnabled()) {
        return '定时任务功能已暂时禁用，无法取消任务。';
      }
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
      memoryStore.upsertMemory(charId, {
        category: 'preference',
        content: args.fact,
        importance: 2,
      });
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
        const basePrompt = getBasePrompt(charId);
        const personaEssence = getPersonaEssence(charId);
        if (basePrompt && !prompt.toLowerCase().includes('24-year-old') && !prompt.toLowerCase().includes('24yo')) {
          const personaBlock = personaEssence ? `, ${personaEssence}` : '';
          prompt = `${basePrompt}${personaBlock}, ${prompt}`;
        }
        const result = await imageGenerator.generateImage(prompt, style, aspectRatio);
        memoryStore.upsertMemory(charId, { category: 'event', content: `生成了图片 (${style})`, importance: 1 });
        const platform = agentConfig.platform || 'qq';
        const imagePath = result.localPath || result.url;
        await messageRouter.sendImage(platform, imagePath, '', undefined, undefined, agentId);
        return '图片已发送';
      } catch (error) {
        return `图片生成失败: ${error.message}`;
      }
    },

    trigger_scenario: async (args) => {
      const { scenarioType, context, goal } = args;
      const typeMap = {
        daily_interaction: '日常互动',
        intimate_progression: '情色推进',
        relationship_development: '关系发展',
        conflict_creation: '冲突创造',
        memory_recall: '回忆触发',
      };
      storyStateStore.triggerScenario(charId, { scenarioType, context, goal });
      const typeName = typeMap[scenarioType] || scenarioType;
      return `已触发${typeName}场景，目标：${goal}。${context ? `上下文：${context}` : ''}`;
    },

    create_tension: async (args) => {
      const { level, source, escalation } = args;
      storyStateStore.setTension(charId, level);
      return `已创建级别${level}的剧情张力，冲突来源：${source}，升级方式：${escalation || '自然升级'}`;
    },

    advance_relationship: async (args) => {
      const { currentStage, targetStage, method } = args;
      storyStateStore.advanceRelationship(charId, targetStage);
      return `已计划将关系从"${currentStage}"推进到"${targetStage}"，方法：${method}`;
    },

    recall_event: async (args) => {
      const { keyword, category, purpose } = args;
      let memories = keyword
        ? memoryStore.searchMemory(charId, keyword)
        : memoryStore.getAllMemories(charId);
      if (category && category !== 'all') {
        memories = memories.filter(m => m.category === category);
      }
      if (memories.length === 0) {
        return keyword ? `没有找到关于"${keyword}"的回忆。` : '暂时还没有存储任何回忆。';
      }
      const relevant = memories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3);
      const summary = relevant.map(m => `• ${m.content}`).join('\n');
      return `已找到相关回忆用于${purpose}：\n${summary}`;
    },
  };
}

async function runTurn(ctx) {
  const {
    userMessage,
    onLog,
    msgPlatform,
    meta = {},
    liveConfig,
    charId,
    agentId,
    platform,
  } = ctx;

  const targetPlatform = msgPlatform || platform;
  const toolExecutors = buildToolExecutors(liveConfig, charId);

  if (userMessage && imagePipeline.isScheduledImageRequest(userMessage)) {
    await imagePipeline.handleScheduledRequest({
      userMessage, charId, agentId, platform: targetPlatform, meta,
      liveConfig, toolExecutors, onLog,
    });
    return;
  }

  if (userMessage && imagePipeline.shouldTriggerImageGeneration(userMessage)) {
    const result = await imagePipeline.handleInstantRequest({
      userMessage, charId, agentId, platform: targetPlatform, meta, onLog,
    });
    if (result.success) {
      await imagePipeline.sendImageComment({
        userMessage, charId, agentId, platform: targetPlatform, meta,
        liveConfig, toolExecutors, onLog,
      });
    }
    return;
  }

  const schedulerEnabled = isSchedulerEnabled();
  const effectiveConfig = userMessage
    ? { ...liveConfig, tools: getChatTools(schedulerEnabled) }
    : { ...liveConfig, tools: getHeartbeatTools(schedulerEnabled) };

  const turnInput = userMessage
    ? userMessage
    : { ephemeralUserContent: buildHeartbeatPrompt(charId), persistUserMessage: false };

  const result = await agentLoop.runAgentTurn(effectiveConfig, turnInput, toolExecutors, onLog, charId);

  if (userMessage && result.content) {
    await sendTextReply(targetPlatform, result.content, meta, agentId);
    onLog('info', `[${agentId}] Reply sent to ${targetPlatform}: ${result.content.substring(0, 40)}...`);
  } else if (userMessage && !result.content) {
    if (imagePipeline.shouldTriggerImageGeneration(userMessage)) {
      const fallbackReply = buildImageFallbackReply(charId, userMessage);
      await sendTextReply(targetPlatform, fallbackReply, meta, agentId);
      onLog('info', `[${agentId}] Fallback image reply sent`);
    } else {
      onLog('error', `[${agentId}] runTurn returned no content for user message`);
    }
  }
}

module.exports = { buildToolExecutors, runTurn };
