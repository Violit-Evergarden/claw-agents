'use strict';

const messageRouter = require('../adapters/message-router');

/**
 * 统一文本回复发送
 */
async function sendTextReply(platform, content, meta = {}, agentId) {
  const { openid, msgId } = meta;
  await messageRouter.sendMessage(platform, content, openid, msgId, agentId);
}

/**
 * 统一图片回复发送
 */
async function sendImageReply(platform, imagePath, meta = {}, agentId, caption = '') {
  const { openid, msgId } = meta;
  await messageRouter.sendImage(platform, imagePath, caption, openid, msgId, agentId);
}

module.exports = { sendTextReply, sendImageReply };
