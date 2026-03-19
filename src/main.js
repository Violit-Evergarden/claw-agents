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
