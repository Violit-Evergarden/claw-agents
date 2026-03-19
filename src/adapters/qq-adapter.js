'use strict';

const axios = require('axios');
const crypto = require('crypto');

/**
 * 工厂函数：为每个 QQ Bot 创建独立的 Adapter 实例
 * 每个实例维护自己的 appId / appSecret / tokenCache，互不干扰
 *
 * @param {string} appId
 * @param {string} appSecret
 * @returns {QQAdapter}
 */
function createQQAdapter(appId, appSecret) {
  let tokenCache = { token: null, expiresAt: 0 };

  /**
   * 获取 AccessToken（带缓存）
   */
  async function getAccessToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
      return tokenCache.token;
    }
    const res = await axios.post('https://bots.qq.com/app/getAppAccessToken', {
      appId,
      clientSecret: appSecret,
    });
    const { access_token, expires_in } = res.data;
    tokenCache = {
      token: access_token,
      expiresAt: Date.now() + (expires_in - 60) * 1000,
    };
    console.log(`[QQ:${appId}] Token refreshed`);
    return access_token;
  }

  /**
   * 带重试的 HTTP POST（处理 503 等临时错误）
   */
  async function postWithRetry(url, body, headers, maxRetries = 3) {
    let lastErr;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await axios.post(url, body, { headers });
        return res;
      } catch (err) {
        const status = err.response?.status;
        const responseData = err.response?.data;
        console.error(`[QQ:${appId}] HTTP ${status} from ${url}: ${
          typeof responseData === 'string' ? responseData.substring(0, 300) : JSON.stringify(responseData)
        }`);
        if (status && status >= 400 && status < 500) throw err;
        lastErr = err;
        const delay = (i + 1) * 1000;
        console.warn(`[QQ:${appId}] Retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        if (status === 503 || status === 401) {
          tokenCache = { token: null, expiresAt: 0 };
          headers['Authorization'] = `QQBot ${await getAccessToken()}`;
        }
      }
    }
    throw lastErr;
  }

  /**
   * 上传图片到 QQ 好友（单聊）
   * @param {string} openid - 用户 openid
   * @param {string} imageUrl - 图片 URL
   * @returns {Promise<string>} file_info
   */
  async function uploadFriendImage(openid, imageUrl) {
    const token = await getAccessToken();
    const body = {
      file_type: 1, // 1=图片
      url: imageUrl,
      srv_send_msg: false, // 先上传，不直接发送
    };
    const headers = {
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': appId,
      'Content-Type': 'application/json',
    };
    const res = await postWithRetry(
      `https://api.sgroup.qq.com/v2/users/${openid}/files`,
      body,
      headers
    );
    console.log(`[QQ:${appId}] Image uploaded for ${openid}, file_info: ${res.data.file_info.substring(0, 50)}...`);
    return res.data.file_info;
  }

  /**
   * 发送消息到 QQ 好友（单聊）
   */
  async function sendFriendMessage(openid, content, msgId) {
    const token = await getAccessToken();
    const body = { content, msg_type: 0 };
    if (msgId) body.msg_id = msgId;
    const headers = {
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': appId,
      'Content-Type': 'application/json',
    };
    const res = await postWithRetry(
      `https://api.sgroup.qq.com/v2/users/${openid}/messages`,
      body,
      headers
    );
    console.log(`[QQ:${appId}] Sent to ${openid}${msgId ? ' (reply)' : ' (proactive)'}: ${content.substring(0, 30)}...`);
    return res.data;
  }

  /**
   * 发送图片到 QQ 好友（单聊）
   * @param {string} openid - 用户 openid
   * @param {string} imageUrl - 图片 URL
   * @param {string} [caption] - 图片说明文字
   * @param {string} [msgId] - 回复消息 ID
   */
  async function sendFriendImage(openid, imageUrl, caption = '', msgId) {
    try {
      // 1. 上传图片获取 file_info
      const fileInfo = await uploadFriendImage(openid, imageUrl);
      
      // 2. 发送图片消息
      const token = await getAccessToken();
      const body = {
        msg_type: 7, // 7=富媒体消息
        media: { file_info: fileInfo },
      };
      if (caption) {
        body.content = caption;
      }
      if (msgId) {
        body.msg_id = msgId;
      }
      
      const headers = {
        Authorization: `QQBot ${token}`,
        'X-Union-Appid': appId,
        'Content-Type': 'application/json',
      };
      
      const res = await postWithRetry(
        `https://api.sgroup.qq.com/v2/users/${openid}/messages`,
        body,
        headers
      );
      
      console.log(`[QQ:${appId}] Image sent to ${openid}${msgId ? ' (reply)' : ' (proactive)'}: ${imageUrl.substring(0, 50)}...`);
      return res.data;
    } catch (error) {
      console.error(`[QQ:${appId}] Failed to send image to ${openid}:`, error.message);
      // 如果图片发送失败，尝试发送文本消息
      if (caption) {
        await sendFriendMessage(openid, `[图片发送失败，但我想说：${caption}]`, msgId);
      } else {
        await sendFriendMessage(openid, '[图片发送失败，但我想分享一张照片给你]', msgId);
      }
      throw error;
    }
  }

  /**
   * 上传图片到 QQ 群
   */
  async function uploadGroupImage(groupId, imageUrl) {
    const token = await getAccessToken();
    const body = {
      file_type: 1,
      url: imageUrl,
      srv_send_msg: false,
    };
    const headers = {
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': appId,
      'Content-Type': 'application/json',
    };
    const res = await postWithRetry(
      `https://api.sgroup.qq.com/v2/groups/${groupId}/files`,
      body,
      headers
    );
    console.log(`[QQ:${appId}] Image uploaded for group ${groupId}`);
    return res.data.file_info;
  }

  /**
   * 发送消息到 QQ 群
   */
  async function sendGroupMessage(groupId, content, msgId) {
    const token = await getAccessToken();
    const body = { content, msg_type: 0 };
    if (msgId) body.msg_id = msgId;
    const headers = {
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': appId,
      'Content-Type': 'application/json',
    };
    const res = await postWithRetry(
      `https://api.sgroup.qq.com/v2/groups/${groupId}/messages`,
      body,
      headers
    );
    console.log(`[QQ:${appId}] Sent group message to ${groupId}`);
    return res.data;
  }

  /**
   * 发送图片到 QQ 群
   */
  async function sendGroupImage(groupId, imageUrl, caption = '', msgId) {
    try {
      const fileInfo = await uploadGroupImage(groupId, imageUrl);
      const token = await getAccessToken();
      const body = {
        msg_type: 7,
        media: { file_info: fileInfo },
      };
      if (caption) {
        body.content = caption;
      }
      if (msgId) {
        body.msg_id = msgId;
      }
      
      const headers = {
        Authorization: `QQBot ${token}`,
        'X-Union-Appid': appId,
        'Content-Type': 'application/json',
      };
      
      const res = await postWithRetry(
        `https://api.sgroup.qq.com/v2/groups/${groupId}/messages`,
        body,
        headers
      );
      
      console.log(`[QQ:${appId}] Image sent to group ${groupId}`);
      return res.data;
    } catch (error) {
      console.error(`[QQ:${appId}] Failed to send image to group ${groupId}:`, error.message);
      if (caption) {
        await sendGroupMessage(groupId, `[图片发送失败，但我想说：${caption}]`, msgId);
      }
      throw error;
    }
  }

  /**
   * 处理 QQ Webhook 推送的事件
   * @param {Object} event - QQ 开放平台事件对象
   * @param {Function} onMessage - async (userId, content, type, groupId, msgId) => void
   */
  async function handleWebhookEvent(event, onMessage) {
    const { t: eventType, d: data } = event;

    if (eventType === 'FRIEND_ADD' || eventType === 'C2C_MESSAGE_CREATE') {
      const userId = data.author?.user_openid || data.author?.id;
      const content = data.content?.trim();
      const msgId = data.id;
      if (userId && content) {
        await onMessage(userId, content, 'friend', null, msgId);
      }
    }

    if (eventType === 'GROUP_AT_MESSAGE_CREATE') {
      const userId = data.author?.member_openid || data.author?.id;
      const groupId = data.group_openid;
      const content = data.content?.replace(/<@!\d+>/g, '').trim();
      const msgId = data.id;
      if (userId && content) {
        await onMessage(userId, content, 'group', groupId, msgId);
      }
    }
  }

  /**
   * 验证 QQ Webhook 签名（HMAC-SHA256）
   */
  function verifySignature(body, signature, timestamp, nonce) {
    const str = timestamp + nonce + JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', appSecret).update(str).digest('hex');
    return hmac === signature;
  }

  /**
   * 处理 QQ Webhook op=13 验证握手（Ed25519 签名）
   * 算法与官方 Go SDK 完全一致：
   *   1. 将 appSecret 重复拼接至 ≥32 字节，取前 32 字节作为 seed
   *   2. 用 seed 作为 Ed25519 私钥的 raw seed（PKCS8 DER 封装）
   *   3. 对 event_ts + plain_token 做 Ed25519 签名，返回 hex
   *
   * Go 官方：ed25519.GenerateKey(strings.NewReader(seed[:32]))
   * 该函数从 reader 读 32 字节 seed 直接作为私钥 seed（非派生），
   * 对应 Node.js 的 PKCS8 DER 封装方式是完全等价的。
   * 返回 { plain_token, signature }
   */
  function handleValidation(d) {
    const { plain_token, event_ts } = d;

    // Step 1: 重复拼接 appSecret 至 ≥32 字节，取前 32 字节作为 seed
    let seed = appSecret;
    while (seed.length < 32) seed = seed + seed;
    seed = seed.slice(0, 32);

    // Step 2: 构造 Ed25519 PKCS8 私钥（seed 直接作为 raw private key bytes）
    // PKCS8 DER 头 + 32 字节 seed = 标准 Ed25519 私钥 DER 格式
    const seedBuf = Buffer.from(seed, 'utf8');
    // Ed25519 PKCS8 DER header (RFC 8410)
    const pkcs8Header = Buffer.from(
      '302e020100300506032b657004220420',
      'hex'
    );
    const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
    const privateKey = crypto.createPrivateKey({
      key: pkcs8Der,
      format: 'der',
      type: 'pkcs8',
    });

    // Step 3: 签名消息 = event_ts + plain_token（与官方文档顺序一致）
    const msg = Buffer.from(event_ts + plain_token, 'utf8');
    const sigBuf = crypto.sign(null, msg, privateKey);

    return { plain_token, signature: sigBuf.toString('hex') };
  }

  return {
    appId,
    getAccessToken,
    sendFriendMessage,
    sendGroupMessage,
    sendFriendImage,
    sendGroupImage,
    handleWebhookEvent,
    verifySignature,
    handleValidation,
  };
}

module.exports = { createQQAdapter };
