'use strict';

const config = require('../config.json');
const agentManager = require('./core/agent-manager');
const cronManager = require('./scheduler/cron-manager');
const messageRouter = require('./adapters/message-router');
const { createQQAdapter } = require('./adapters/qq-adapter');
const sse = require('./server/sse');
const { createServer } = require('./server/index');
const { createGirlfriendAgent } = require('./agents/girlfriend/config');
const { createAssistantAgent } = require('./agents/assistant/config');
const { generateImagePrompt, clearPromptCache } = require('./agents/girlfriend/image-trigger');
const imageGenerator = require('./agents/girlfriend/image-generator');
const characterStore = require('./core/character-store');

// ── 启动横幅 ──
console.log(`
╔══════════════════════════════════════════╗
║          Claw Agents  v1.0.0             ║
║     Multi-Bot AI Girlfriend System       ║
╚══════════════════════════════════════════╝
`);

async function main() {
  // 1. 配置定时任务执行器
  cronManager.setExecutor(async (task) => {
    if (task.action === 'send_message') {
      let content = task.content || task.description;
      const now = new Date();
      content = content
        .replace('{time}', now.toLocaleTimeString('zh-CN'))
        .replace('{date}', now.toLocaleDateString('zh-CN'));
      await messageRouter.sendMessage(task.platform || 'console', content, undefined, undefined, task.agentId);
      return `Sent: ${content.substring(0, 50)}`;
    }
    if (task.action === 'run_loop') {
      await agentManager.triggerManually(task.agentId || 'violet');
      return 'Agent loop triggered';
    }
    if (task.action === 'send_image') {
      // 定时图片任务：用 LLM 智能生成提示词，然后生成图片并发送
      try {
        const params = JSON.parse(task.content || '{}');
        const charId = params.charId || task.agentId || 'violet';

        // 用 LLM 智能生成提示词（替代旧的硬编码拼接）
        const imageParams = await generateImagePrompt(charId, params.originalMessage || '发张照片');

        // ========== 打印完整 prompt 用于调试 ==========
        console.log(`[Cron] send_image FULL PROMPT:\n"${imageParams.prompt}"`);
        console.log(`[Cron] send_image params: style=${imageParams.style}, aspectRatio=${imageParams.aspectRatio}`);
        // ==============================================

        const result = await imageGenerator.generateImage(imageParams.prompt, imageParams.style, imageParams.aspectRatio);
        const imagePath = result.localPath || result.url;
        if (!imagePath) throw new Error('图片路径为空');

        await messageRouter.sendImage(
          task.platform || 'qq',
          imagePath,
          '',  // caption 为空，保持自然
          params.userOpenid || undefined,
          undefined,
          task.agentId
        );
        return '定时图片已发送';
      } catch (err) {
        console.error(`[Cron] send_image task failed: ${err.message}`);

        // 如果是内容审核拒绝，清缓存并尝试用安全模式重试一次
        if (err.message.includes('content moderation')) {
          console.log('[Cron] Content moderation rejected, clearing cache and retrying with safe fallback...');
          clearPromptCache();
          try {
            const params = JSON.parse(task.content || '{}');
            const charId = params.charId || task.agentId || 'violet';
            // 强制重新生成（不走缓存）
            const { getImageGenerationParams } = require('./agents/girlfriend/image-trigger');
            const safeParams = getImageGenerationParams(charId, params.originalMessage || '发张照片');

            console.log(`[Cron] RETRY FULL PROMPT:\n"${safeParams.prompt}"`);
            console.log(`[Cron] RETRY params: style=${safeParams.style}, aspectRatio=${safeParams.aspectRatio}`);

            const result = await imageGenerator.generateImage(safeParams.prompt, safeParams.style, safeParams.aspectRatio);
            const imagePath = result.localPath || result.url;
            if (imagePath) {
              await messageRouter.sendImage(
                task.platform || 'qq',
                imagePath,
                '',
                params.userOpenid || undefined,
                undefined,
                task.agentId
              );
              return '定时图片已发送（fallback）';
            }
          } catch (retryErr) {
            console.error(`[Cron] Fallback retry also failed: ${retryErr.message}`);
          }
        }

        try {
          const params = JSON.parse(task.content || '{}');
          await messageRouter.sendMessage(
            task.platform || 'qq',
            '抱歉，图片生成失败了…',
            params.userOpenid || undefined,
            undefined,
            task.agentId
          );
        } catch (_) {}
        return `Error: ${err.message}`;
      }
    }
    return 'unknown action';
  });

  // 2. 从持久化存储恢复定时任务
  cronManager.restoreFromStore();

  // 3. 注册所有 QQ Bot（多 bot 支持）
  const bots = config.bots || [];
  const botConfigs = []; // 传给 createServer 用于注册 Webhook 路由

  for (let index = 0; index < bots.length; index++) {
    const botCfg = bots[index];
    if (botCfg.enabled === false) continue;

    // 每个 bot 使用独立的 agentId；第一个 bot 默认沿用 'violet' 保持向下兼容
    const agentId = botCfg.agentId || (index === 0 ? 'violet' : `violet_${index}`);

    // 创建独立的 QQ Adapter 实例（各自维护 token 缓存，互不干扰）
    const adapter = createQQAdapter(botCfg.appId, botCfg.appSecret);

    // 将 adapter 注册到消息路由器，后续 sendMessage 按 agentId 找到对应 adapter
    messageRouter.registerBot(agentId, adapter);

    // 创建 Violet Agent（传入 characterId 实现记忆隔离）
    const { agentConfig, runTurn } = createGirlfriendAgent({
      agentId,
      characterId: botCfg.characterId || '',   // 空字符串 = 使用全局激活角色
      heartbeatInterval: botCfg.heartbeatInterval || 120000,
      platform: 'qq',
    });

    agentManager.register(agentConfig, runTurn);
    agentManager.start(agentId);

    botConfigs.push({ index, agentId, adapter });

    console.log(`[Main] Bot ${index} registered: agentId=${agentId}, appId=${botCfg.appId}, characterId=${botCfg.characterId || '(active)'}`);
  }

  // 4. 注册工作助理 Agent（无心跳，只响应消息）
  if (config.agents?.assistant?.enabled !== false) {
    const { agentConfig, runTurn } = createAssistantAgent();
    agentManager.register(agentConfig, runTurn);
  }

  // 5. AgentManager 事件桥接到 SSE
  agentManager.on('log', (entry) => {
    sse.broadcast('agent:log', entry);
  });
  agentManager.on('agent:status', (data) => {
    sse.broadcast('agent:status', data);
  });
  cronManager.on('task:added', (task) => {
    sse.broadcast('task:added', task);
  });
  cronManager.on('task:executed', ({ task, result }) => {
    sse.broadcast('task:executed', { taskId: task.id, description: task.description, result });
  });
  cronManager.on('task:removed', (taskId) => {
    sse.broadcast('task:removed', { taskId });
  });
  cronManager.on('task:paused', (taskId) => {
    sse.broadcast('task:paused', { taskId });
  });

  // 6. 启动 Express 服务
  const app = createServer(botConfigs);
  const PORT = config.server.port || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api/agents`);
    console.log(`📡 SSE: http://localhost:${PORT}/events`);
    botConfigs.forEach(b => {
      console.log(`🤖 QQ Webhook [${b.agentId}]: http://localhost:${PORT}/webhook/qq/${b.index}`);
    });
    console.log('');
  });

  // 7. 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[Main] Shutting down gracefully...');
    const allAgentIds = agentManager.getAll().map(a => a.id);
    allAgentIds.forEach(id => agentManager.stop(id));
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
