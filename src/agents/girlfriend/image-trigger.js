'use strict';

/**
 * 图片生成触发器
 * 职责：
 * 1. 即时图片请求 → shouldTriggerImageGeneration() 返回 true → 由 config.js 直接生成
 * 2. 定时图片请求 → isScheduledImageRequest() 返回 true → 由 config.js 创建定时任务
 */

// 图片请求关键词
const IMAGE_KEYWORDS = [
  // 照片/图片
  '看看照片', '看看你的照片', '发张照片', '发照片',
  '想看看你', '看看你', '你的照片', '发一张照片', '照片',
  '看看图片', '你的图片', '发图片',
  '想看你', '想看看', '想要看你的照片',
  '发张自拍', '自拍',
  // 身体部位
  '看腿', '看看腿', '腿照', '腿的照片', '想看腿',
  '看胸', '看看胸', '胸照', '胸部', '想看胸',
  '看脸', '看看脸', '脸照', '颜值',
  '看全身', '全身照', '全身照片',
  // 风格
  'jk', 'cosplay', '穿jk', '穿这个',
];

// 时间指定关键词
const TIME_KEYWORDS = [
  '分钟后', '分钟后来', '分钟后给', '分钟后发',
  '秒后', '秒后来', '秒后给', '秒后发',
  '小时后', '小时后给', '小时后发',
  '等下', '等一下', '等一会', '等一会儿',
  '一会给', '一会发', '一会后',
  '稍后', '稍后给', '稍后发',
  '待会', '待会给', '待会发',
  '过一会', '过一会给', '过一会发',
];

function containsImageKeyword(msg) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return IMAGE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function containsTimeKeyword(msg) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return TIME_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * 检测是否为即时图片请求（有时间词则不算即时）
 */
function shouldTriggerImageGeneration(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  if (containsTimeKeyword(userMessage)) return false;
  return containsImageKeyword(userMessage);
}

/**
 * 检测是否为定时图片请求（同时包含时间词和图片词）
 */
function isScheduledImageRequest(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  return containsTimeKeyword(userMessage) && containsImageKeyword(userMessage);
}

/**
 * 从用户消息中解析延迟分钟数
 */
function parseDelayMinutes(userMessage) {
  if (!userMessage) return 1;
  const lower = userMessage.toLowerCase();
  let match;
  if ((match = lower.match(/(\d+)\s*分钟/))) return parseInt(match[1], 10);
  if ((match = lower.match(/(\d+)\s*秒/))) return Math.max(1, Math.ceil(parseInt(match[1], 10) / 60));
  if ((match = lower.match(/(\d+)\s*小时/))) return parseInt(match[1], 10) * 60;
  // 模糊时间词默认 1 分钟
  if (containsTimeKeyword(userMessage)) return 1;
  return 1;
}

/**
 * 根据角色获取基础提示词
 */
function getBasePrompt(characterId) {
  const prompts = {
    christina: '24岁，亚洲女生，身高172cm，拥有极致完美的身材：肤白如瓷、貌美惊艳、胸部丰满（E杯以上）、细腰翘臀、长腿修直。 黑长直微卷长发垂至腰际，眉眼锋利冷艳，五官精致立体，唇色天然淡红，整体气质清冷高傲，像一朵不可亵玩的冰山雪莲，却在面对弟弟时会瞬间转为极度占有欲和色欲的支配者。',
    shuangqing: 'a beautiful ethereal fairy woman with cold aura, icy blue background, traditional Chinese celestial style, long dark hair, elegant white robes, misty atmosphere, portrait, high quality',
  };
  return prompts[characterId] || 'a beautiful woman, portrait, high quality, natural lighting';
}

/**
 * 动态组合提示词
 * @param {string} characterId - 角色 ID
 * @param {string} userMessage - 用户消息
 * @returns {Object} 图片生成参数 { prompt, style, aspectRatio }
 */
function getImageGenerationParams(characterId, userMessage = null) {
  let style = 'realistic';
  let aspectRatio = 'square';
  let prompt = getBasePrompt(characterId);

  if (userMessage) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('腿')) {
      prompt += ', focusing on elegant long legs, slender legs';
      aspectRatio = 'portrait';
    }
    if (msg.includes('胸')) {
      prompt += ', attractive curves';
    }
    if (msg.includes('脸') || msg.includes('自拍') || msg.includes('颜值')) {
      prompt += ', selfie style, friendly smile, face close-up';
      aspectRatio = 'square';
    }
    if (msg.includes('jk') || msg.includes('cosplay')) {
      prompt = 'a beautiful Asian girl wearing JK school uniform, pleated skirt, white shirt, neat hairstyle, youthful and cute';
      style = 'photographic';
      aspectRatio = 'portrait';
    }
    if (msg.includes('全身')) {
      prompt += ', full body portrait';
      aspectRatio = 'portrait';
    }
  }

  return { prompt, style, aspectRatio };
}

// 兼容旧代码
function generatePromptForCharacter(characterId) {
  return getBasePrompt(characterId);
}

module.exports = {
  shouldTriggerImageGeneration,
  isScheduledImageRequest,
  parseDelayMinutes,
  generatePromptForCharacter,
  getImageGenerationParams,
};
