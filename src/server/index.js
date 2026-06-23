'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const sse = require('./sse');
const agentsRouter = require('./routes/agents');
const tasksRouter = require('./routes/tasks');
const memoriesRouter = require('./routes/memories');
const charactersRouter = require('./routes/characters');
const settingsRouter = require('./routes/settings');
const messageRouter = require('../adapters/message-router');
const agentManager = require('../core/agent-manager');

/**
 * 创建 Express 服务
 * @param {Array} botConfigs - [{ agentId, adapter }] 由 main.js 传入
 */
function createServer(botConfigs = []) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  // 跳过 ngrok 免费版的浏览器警告拦截页（QQ 开放平台 webhook 校验需要）
  app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
  });

  // 静态托管前端面板
  const dashboardDist = path.join(__dirname, '../../dashboard/dist');
  app.use(express.static(dashboardDist));

  // SSE 实时事件流
  app.get('/events', (req, res) => {
    sse.addClient(res);
  });

  // REST API 路由
  app.use('/api/agents', agentsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/memories', memoriesRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/settings', settingsRouter);

  // ── 多 Bot Webhook 注册 ──
  // 每个 bot 对应一条独立路由：POST /webhook/qq/:index（index 从 0 开始）
  // QQ 开放平台后台为每个 bot 配置不同的 Webhook URL，形如：
  //   Bot 0: https://your-domain/webhook/qq/0
  //   Bot 1: https://your-domain/webhook/qq/1
  for (const { agentId, adapter, index } of botConfigs) {
    const webhookPath = `/webhook/qq/${index}`;

    app.post(webhookPath, async (req, res) => {
      const body = req.body;

      // op=13：QQ 开放平台验证握手
      if (body.op === 13) {
        try {
          const result = adapter.handleValidation(body.d);
          console.log(`[Webhook${webhookPath}] Validation op=13 OK, agentId=${agentId}`);
          return res.json(result);
        } catch (err) {
          console.error(`[Webhook${webhookPath}] Validation failed:`, err.message);
          return res.status(500).json({ error: 'validation failed', detail: err.message });
        }
      }

      // 记录用户 openid，用于该 bot 的主动推送
      if (body.d?.author?.user_openid) {
        messageRouter.setTarget(agentId, 'qq', body.d.author.user_openid);
      }

      // 处理消息事件，dispatch 到对应的 agent
      await adapter.handleWebhookEvent(body, async (userId, content, type, groupId, msgId) => {
        console.log(`[Webhook${webhookPath}] agent=${agentId} msg from ${userId}: ${content}`);
        const platform = type === 'group' ? 'qq_group' : 'qq';
        await agentManager.dispatchMessage(agentId, content, platform, {
          openid: userId,
          msgId,
          groupId,
          type,
        });
      });

      res.json({ ok: true });
    });

    console.log(`[Server] QQ Webhook registered: POST ${webhookPath} → agent=${agentId}`);
  }

  // 兼容旧路径 /webhook/qq（无 index），自动转发到第一个 bot
  if (botConfigs.length > 0) {
    app.post('/webhook/qq', (req, res, next) => {
      // 将请求重写到 /webhook/qq/0
      req.url = '/webhook/qq/0';
      next('route');
    });
    // 由于 Express 路由已注册，上面的 next('route') 不会生效，直接代理处理
    const first = botConfigs[0];
    app.post('/webhook/qq', async (req, res) => {
      const body = req.body;
      if (body.op === 13) {
        try {
          return res.json(first.adapter.handleValidation(body.d));
        } catch (err) {
          return res.status(500).json({ error: 'validation failed', detail: err.message });
        }
      }
      if (body.d?.author?.user_openid) {
        messageRouter.setTarget(first.agentId, 'qq', body.d.author.user_openid);
      }
      await first.adapter.handleWebhookEvent(body, async (userId, content, type, groupId, msgId) => {
        const platform = type === 'group' ? 'qq_group' : 'qq';
        await agentManager.dispatchMessage(first.agentId, content, platform, {
          openid: userId, msgId, groupId, type,
        });
      });
      res.json({ ok: true });
    });
  }

  // 前端路由回退（SPA）
  app.get('*', (req, res) => {
    const indexFile = path.join(dashboardDist, 'index.html');
    const fs = require('fs');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      const botList = botConfigs
        .map(b => `Bot ${b.index}: agent=${b.agentId} → <a href="/webhook/qq/${b.index}" style="color:#9B7EC8">/webhook/qq/${b.index}</a>`)
        .join('<br>');
      res.status(200).send(`
        <html><body style="background:#0F0D1A;color:#F0ECF8;font-family:sans-serif;padding:40px">
          <h1>🌸 Claw Agents</h1>
          <p>后端服务运行中。前端面板尚未构建，请进入 dashboard/ 目录执行 npm run build。</p>
          <p>API: <a href="/api/agents" style="color:#9B7EC8">/api/agents</a> | <a href="/api/tasks" style="color:#9B7EC8">/api/tasks</a> | <a href="/api/memories/violet" style="color:#9B7EC8">/api/memories/violet</a></p>
          <p>已注册机器人：<br>${botList || '无'}</p>
        </body></html>
      `);
    }
  });

  return app;
}

module.exports = { createServer };
