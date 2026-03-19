'use strict';

/**
 * SSE (Server-Sent Events) 管理器
 * 用于向前端实时推送 Agent 日志和任务状态变更
 */

const clients = new Set();

/**
 * 注册一个 SSE 客户端连接
 */
function addClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // 发送初始连接确认
  res.write('data: {"type":"connected"}\n\n');

  clients.add(res);
  console.log(`[SSE] Client connected. Total: ${clients.size}`);

  res.on('close', () => {
    clients.delete(res);
    console.log(`[SSE] Client disconnected. Total: ${clients.size}`);
  });
}

/**
 * 广播事件到所有 SSE 客户端
 * @param {string} eventType - 事件类型
 * @param {Object} data - 事件数据
 */
function broadcast(eventType, data) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });
  const dead = [];
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`, (err) => {
      if (err) dead.push(client);
    });
  }
  // 清理断开的连接
  dead.forEach(c => clients.delete(c));
}

module.exports = { addClient, broadcast };
