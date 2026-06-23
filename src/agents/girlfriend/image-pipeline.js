'use strict';

const cronManager = require('../../scheduler/cron-manager');
const { isSchedulerEnabled } = require('../../core/config-loader');
const memoryStore = require('../../core/memory-store');
const imageGenerator = require('./image-generator');
const { sendTextReply, sendImageReply } = require('../../core/reply-dispatcher');
const {
  shouldTriggerImageGeneration,
  isScheduledImageRequest,
  parseDelayMinutes,
  generateImagePrompt,
  getBasePrompt,
  getPersonaEssence,
  clearPromptCache,
  getImageGenerationParams,
} = require('./image-trigger');
const agentLoop = require('../../core/agent-loop');

const MAX_ATTEMPTS = 3;

function injectBasePrompt(prompt, charId) {
  const basePrompt = getBasePrompt(charId);
  const personaEssence = getPersonaEssence(charId);
  const baseSnippet = basePrompt ? basePrompt.slice(0, 12) : '';
  if (basePrompt && baseSnippet && !prompt.includes(baseSnippet)) {
    const personaBlock = personaEssence ? `, ${personaEssence}` : '';
    return `${basePrompt}${personaBlock}, ${prompt}`;
  }
  return prompt;
}

/**
 * 定时图片请求：创建 cron 任务 + LLM 确认回复
 */
async function handleScheduledRequest(ctx) {
  const { userMessage, charId, agentId, platform, meta, liveConfig, toolExecutors, onLog } = ctx;

  if (!isSchedulerEnabled()) {
    onLog('info', `[${agentId}] 定时任务已禁用，改为即时处理图片请求`);
    await handleInstantRequest({ userMessage, charId, agentId, platform, meta, onLog });
    if (userMessage) {
      await sendImageComment({
        userMessage, charId, agentId, platform, meta,
        liveConfig, toolExecutors, onLog,
      });
    }
    return { handled: true };
  }

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
      platform: platform || liveConfig.platform,
      agentId,
    });
  } catch (err) {
    onLog('error', `[${agentId}] 创建定时图片任务失败: ${err.message}`);
  }

  const replyPrompt = `用户说："${userMessage}"\n\n[系统] 你已经为用户安排了${minutes}分钟后的定时图片发送。请用一句自然的话回复用户，确认你会按时发照片（不要提及技术细节如 cron、任务等）。`;
  const replyConfig = { ...liveConfig, tools: [] };
  const replyResult = await agentLoop.runAgentTurn(
    replyConfig,
    { ephemeralUserContent: replyPrompt, persistUserMessage: false },
    toolExecutors,
    onLog,
    charId
  );

  if (replyResult.content) {
    await sendTextReply(platform, replyResult.content, meta, agentId);
  }
  return { handled: true };
}

/**
 * 即时图片请求：生成并发送
 */
async function handleInstantRequest(ctx) {
  const { userMessage, charId, agentId, platform, meta, onLog } = ctx;
  onLog('info', `[${agentId}] 检测到即时图片请求，使用 LLM 智能生成提示词...`);

  const recentMessages = memoryStore.getMessages(charId).slice(-10);
  const conversationContextBase = recentMessages
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${(m.content || '').substring(0, 100)}`)
    .join('\n');

  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const conversationContext = attempt === 0
        ? conversationContextBase
        : `${conversationContextBase}\n\n【重试要求】上一次图片生成失败。请把亲密情绪/张力表达得更隐秘、更含蓄：强调氛围、眼神、姿态与光影，不要出现露骨的明确性行为或显式生理细节；同时确保风格与角色气质一致，并更容易通过图片审核。`;

      const imageParams = await generateImagePrompt(charId, userMessage, conversationContext);
      onLog('info', `[${agentId}] LLM 图片参数: prompt="${imageParams.prompt.substring(0, 60)}..." style=${imageParams.style} ratio=${imageParams.aspectRatio} (attempt=${attempt + 1}/${MAX_ATTEMPTS})`);

      let { prompt, style = 'realistic', aspectRatio = 'square' } = imageParams;
      prompt = injectBasePrompt(prompt, charId);

      const result = await imageGenerator.generateImage(prompt, style, aspectRatio);
      const imagePath = result.localPath || result.url;

      await sendImageReply(platform, imagePath, meta, agentId);
      memoryStore.upsertMemory(charId, {
        category: 'event',
        content: `生成了图片 (${style})`,
        importance: 1,
      });

      onLog('info', `[${agentId}] 图片已发送`);
      return { success: true, prompt };
    } catch (error) {
      lastError = error;
      onLog('error', `[${agentId}] 图片生成失败 (attempt=${attempt + 1}/${MAX_ATTEMPTS}): ${error.message}`);
    }
  }

  const failMsg = `图片生成失败：${lastError?.message || '未知原因'}`;
  await sendTextReply(platform, failMsg, meta, agentId);
  return { success: false, error: lastError };
}

/**
 * 图片发送后 LLM 自然评论
 */
async function sendImageComment(ctx, userMessage) {
  const { charId, agentId, platform, meta, liveConfig, toolExecutors, onLog } = ctx;
  const contextPrompt = `用户说："${userMessage}"\n\n[系统] 你刚刚生成并发送了一张图片给用户。请用一句话自然地回应（不要提及"生成图片"、风格、比例等技术细节）。`;
  const effectiveConfig = { ...liveConfig, tools: [] };
  const result = await agentLoop.runAgentTurn(
    effectiveConfig,
    { ephemeralUserContent: contextPrompt, persistUserMessage: false },
    toolExecutors,
    onLog,
    charId
  );

  if (result.content) {
    await sendTextReply(platform, result.content, meta, agentId);
  }
}

/**
 * Cron 定时图片任务执行
 */
async function executeCronTask(task) {
  try {
    const params = JSON.parse(task.content || '{}');
    const charId = params.charId || task.agentId || 'violet';

    const imageParams = await generateImagePrompt(charId, params.originalMessage || '发张照片');
    const result = await imageGenerator.generateImage(imageParams.prompt, imageParams.style, imageParams.aspectRatio);
    const imagePath = result.localPath || result.url;
    if (!imagePath) throw new Error('图片路径为空');

    await sendImageReply(
      task.platform || 'qq',
      imagePath,
      { openid: params.userOpenid },
      task.agentId
    );
    return '定时图片已发送';
  } catch (err) {
    if (err.message.includes('content moderation')) {
      clearPromptCache();
      try {
        const params = JSON.parse(task.content || '{}');
        const charId = params.charId || task.agentId || 'violet';
        const safeParams = getImageGenerationParams(charId, params.originalMessage || '发张照片');
        const result = await imageGenerator.generateImage(safeParams.prompt, safeParams.style, safeParams.aspectRatio);
        const imagePath = result.localPath || result.url;
        if (imagePath) {
          await sendImageReply(task.platform || 'qq', imagePath, { openid: params.userOpenid }, task.agentId);
          return '定时图片已发送（fallback）';
        }
      } catch (retryErr) {
        console.error(`[ImagePipeline] Fallback retry failed: ${retryErr.message}`);
      }
    }

    try {
      const params = JSON.parse(task.content || '{}');
      await sendTextReply(task.platform || 'qq', '抱歉，图片生成失败了…', { openid: params.userOpenid }, task.agentId);
    } catch (_) {}
    throw err;
  }
}

module.exports = {
  shouldTriggerImageGeneration,
  isScheduledImageRequest,
  handleScheduledRequest,
  handleInstantRequest,
  sendImageComment,
  executeCronTask,
  MAX_ATTEMPTS,
};
