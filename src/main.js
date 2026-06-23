'use strict';

const { loadConfig, isSchedulerEnabled } = require('./core/config-loader');
const config = loadConfig();
const agentManager = require('./core/agent-manager');
const cronManager = require('./scheduler/cron-manager');
const messageRouter = require('./adapters/message-router');
const { createQQAdapter } = require('./adapters/qq-adapter');
const sse = require('./server/sse');
const { createServer } = require('./server/index');
const { createAgent } = require('./agents/registry');
const imagePipeline = require('./agents/girlfriend/image-pipeline');

console.log(`
╔══════════════════════════════════════════╗
║          Claw Agents  v1.0.0             ║
║     Multi-Bot AI Girlfriend System       ║
╚══════════════════════════════════════════╝
`);

async function main() {
  if (!isSchedulerEnabled()) {
    console.log('[Main] ⏸  定时任务已禁用 (config.scheduler.enabled=false)，不会恢复/执行 cron 任务');
  }

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
      return imagePipeline.executeCronTask(task);
    }
    return 'unknown action';
  });

  cronManager.restoreFromStore();

  const bots = config.bots || [];
  const botConfigs = [];

  for (let index = 0; index < bots.length; index++) {
    const botCfg = bots[index];
    if (botCfg.enabled === false) continue;

    const agentId = botCfg.agentId || (index === 0 ? 'violet' : `violet_${index}`);
    const agentType = botCfg.type || 'girlfriend';

    const adapter = createQQAdapter(botCfg.appId, botCfg.appSecret);
    messageRouter.registerBot(agentId, adapter);

    const { agentConfig, runTurn } = createAgent(agentType, {
      agentId,
      characterId: botCfg.characterId || '',
      heartbeatInterval: botCfg.heartbeatInterval || 120000,
      platform: 'qq',
      getLiveConfig: () => agentManager.agents.get(agentId)?.config,
    });

    agentManager.register(agentConfig, runTurn);
    agentManager.start(agentId);

    botConfigs.push({ index, agentId, adapter });
    console.log(`[Main] Bot ${index} registered: type=${agentType}, agentId=${agentId}, appId=${botCfg.appId}, characterId=${botCfg.characterId || '(active)'}`);
  }

  if (config.agents?.assistant?.enabled !== false) {
    const { agentConfig, runTurn } = createAgent('assistant');
    agentManager.register(agentConfig, runTurn);
  }

  agentManager.on('log', (entry) => {
    sse.broadcast('agent:log', entry);
  });
  agentManager.on('agent:status', (data) => {
    sse.broadcast('agent:status', data);
  });
  agentManager.on('agent:turn:complete', (data) => {
    sse.broadcast('agent:turn:complete', data);
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

  const app = createServer(botConfigs);
  const PORT = config.server?.port || 3000;
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
