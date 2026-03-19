'use strict';

const axios = require('axios');
const config = require('../../config.json');

/**
 * 发送企业微信群机器人消息
 * @param {string} content - 消息内容
 * @param {string} webhookUrl - 可选，覆盖 config 中的 webhook URL
 */
async function sendMessage(content, webhookUrl) {
  const url = webhookUrl || config.wechat.webhookUrl;
  if (!url) {
    console.warn('[WeChat] webhookUrl not configured, skipping');
    return;
  }
  const res = await axios.post(url, {
    msgtype: 'text',
    text: { content },
  });
  console.log(`[WeChat] Sent message: ${content.substring(0, 30)}...`);
  return res.data;
}

/**
 * 发送 Markdown 格式消息（企业微信支持）
 */
async function sendMarkdown(markdown, webhookUrl) {
  const url = webhookUrl || config.wechat.webhookUrl;
  if (!url) {
    console.warn('[WeChat] webhookUrl not configured, skipping');
    return;
  }
  const res = await axios.post(url, {
    msgtype: 'markdown',
    markdown: { content: markdown },
  });
  return res.data;
}

module.exports = { sendMessage, sendMarkdown };
