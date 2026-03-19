'use strict';

const wechatAdapter = require('./wechat-adapter');

/**
 * 多 Bot 路由器
 *
 * 每个 QQ Bot 对应一个独立的 QQAdapter 实例，通过 agentId 索引。
 * 结构：
 *   botRegistry[agentId] = { adapter: QQAdapter, target: { qq: openid, qq_group: groupId } }
 */
const botRegistry = new Map(); // agentId -> { adapter, targets: { qq, qq_group } }

/**
 * 注册一个 QQ Bot（在 main.js 初始化时调用）
 * @param {string} agentId
 * @param {import('./qq-adapter').QQAdapter} adapter - createQQAdapter() 返回的实例
 */
function registerBot(agentId, adapter) {
  botRegistry.set(agentId, {
    adapter,
    targets: { qq: '', qq_group: '' },
  });
  console.log(`[Router] Registered bot for agent: ${agentId} (appId=${adapter.appId})`);
}

/**
 * 设置目标用户（收到第一条消息时自动调用，记录 openid 用于主动推送）
 * @param {string} agentId
 * @param {string} platform - 'qq' | 'qq_group'
 * @param {string} id - openid 或 groupId
 */
function setTarget(agentId, platform, id) {
  const entry = botRegistry.get(agentId);
  if (entry) {
    entry.targets[platform] = id;
    console.log(`[Router] Set target for agent=${agentId} platform=${platform}: ${id}`);
  }
}

function getTarget(agentId, platform) {
  return botRegistry.get(agentId)?.targets[platform] || '';
}

/**
 * 获取某个 agentId 对应的 QQAdapter（供 server/index.js 使用）
 */
function getAdapter(agentId) {
  return botRegistry.get(agentId)?.adapter || null;
}

/**
 * 统一发送消息接口
 * @param {string} platform - 'qq' | 'qq_group' | 'wechat' | 'console'
 * @param {string} content - 消息内容
 * @param {string} [targetId] - 目标 openid/groupId（可选，默认用已记录的 target）
 * @param {string} [msgId] - 被动回复时传入原始消息 ID
 * @param {string} [agentId] - 指定使用哪个 bot（platform=qq/qq_group 时必须传）
 */
async function sendMessage(platform, content, targetId, msgId, agentId) {
  switch (platform) {
    case 'qq': {
      const entry = agentId ? botRegistry.get(agentId) : botRegistry.values().next().value;
      if (!entry) {
        console.warn(`[Router] No QQ bot registered for agentId=${agentId}, falling back to console`);
        console.log(`[Console->QQ] ${content}`);
        return;
      }
      const target = targetId || entry.targets.qq;
      if (!target) {
        console.warn(`[Router] QQ target not set for agentId=${agentId}, falling back to console`);
        console.log(`[Console->QQ] ${content}`);
        return;
      }
      await entry.adapter.sendFriendMessage(target, content, msgId);
      break;
    }

    case 'qq_group': {
      const entry = agentId ? botRegistry.get(agentId) : botRegistry.values().next().value;
      if (!entry) {
        console.warn(`[Router] No QQ bot registered for agentId=${agentId}`);
        return;
      }
      const target = targetId || entry.targets.qq_group;
      if (!target) {
        console.warn(`[Router] QQ group target not set for agentId=${agentId}`);
        return;
      }
      await entry.adapter.sendGroupMessage(target, content, msgId);
      break;
    }

    case 'wechat':
      await wechatAdapter.sendMessage(content);
      break;

    case 'console':
    default:
      console.log(`[Console] ${content}`);
      break;
  }
}

/**
 * 发送图片消息
 * @param {string} platform - 'qq' | 'qq_group'
 * @param {string} imageUrl - 图片 URL
 * @param {string} [caption] - 图片说明
 * @param {string} [targetId] - 目标 openid/groupId
 * @param {string} [msgId] - 回复消息 ID
 * @param {string} [agentId] - 指定使用哪个 bot
 */
async function sendImage(platform, imageUrl, caption = '', targetId, msgId, agentId) {
  if (platform !== 'qq' && platform !== 'qq_group') {
    console.warn(`[Router] Image sending not supported for platform: ${platform}`);
    await sendMessage(platform, `[图片发送失败，平台不支持] ${caption || ''}`, targetId, msgId, agentId);
    return;
  }

  const entry = agentId ? botRegistry.get(agentId) : botRegistry.values().next().value;
  if (!entry) {
    console.warn(`[Router] No bot registered for agentId=${agentId}`);
    return;
  }

  const target = targetId || entry.targets[platform];
  if (!target) {
    console.warn(`[Router] ${platform} target not set for agentId=${agentId}`);
    return;
  }

  try {
    if (platform === 'qq') {
      await entry.adapter.sendFriendImage(target, imageUrl, caption, msgId);
    } else {
      await entry.adapter.sendGroupImage(target, imageUrl, caption, msgId);
    }
    console.log(`[Router] Image sent via ${platform} to ${target.substring(0, 8)}...`);
  } catch (error) {
    console.error(`[Router] Failed to send image:`, error.message);
    // 失败时发送文本消息
    await sendMessage(platform, `[图片发送失败] ${caption || '给你分享一张图片'}`, targetId, msgId, agentId);
  }
}

module.exports = { registerBot, sendMessage, sendImage, setTarget, getTarget, getAdapter };
