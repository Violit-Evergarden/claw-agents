'use strict';

/**
 * 图片生成触发器 - 基于关键词检测
 * 用于不依赖 LLM function calling 的情况下触发图片生成
 */

// 触发图片生成关键词列表
const IMAGE_GENERATION_KEYWORDS = [
  // 直接请求
  '看看照片',
  '看看你的照片',
  '发张照片',
  '发照片',
  '想看看你',
  '看看你',
  '你的照片',
  '发一张照片',
  '照片',
  // 图片相关
  '看看图片',
  '你的图片',
  '发图片',
  // 想要看到
  '想看你',
  '想看看',
  '想要看你的照片',
  '发张自拍',
  '自拍',
];

/**
 * 检测用户消息是否需要触发图片生成
 * @param {string} userMessage - 用户消息
 * @returns {boolean} 是否需要生成图片
 */
function shouldTriggerImageGeneration(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return false;
  }

  const lowerMessage = userMessage.toLowerCase();
  return IMAGE_GENERATION_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}

/**
 * 根据角色生成合适的图片提示词
 * @param {string} characterId - 角色 ID
 * @returns {string} 英文图片提示词
 */
function generatePromptForCharacter(characterId) {
  const prompts = {
    shuangqing: 'a beautiful ethereal fairy woman with cold aura, icy blue background, traditional Chinese celestial style, long dark hair, elegant white robes, misty atmosphere, portrait, high quality',

    christina: 'a cheerful young woman with bright smile, warm lighting, casual modern clothing, friendly expression, sunny day, natural portrait, photorealistic',

    // 默认提示词
    default: 'a beautiful woman, portrait, high quality, natural lighting',
  };

  return prompts[characterId] || prompts.default;
}

/**
 * 生成图片参数
 * @param {string} characterId - 角色 ID
 * @returns {Object} 图片生成参数
 */
function getImageGenerationParams(characterId) {
  const params = {
    shuangqing: {
      prompt: generatePromptForCharacter('shuangqing'),
      style: 'realistic',
      aspectRatio: 'portrait',
    },
    christina: {
      prompt: generatePromptForCharacter('christina'),
      style: 'realistic',
      aspectRatio: 'square',
    },
  };

  return params[characterId] || {
    prompt: generatePromptForCharacter('default'),
    style: 'realistic',
    aspectRatio: 'square',
  };
}

module.exports = {
  shouldTriggerImageGeneration,
  generatePromptForCharacter,
  getImageGenerationParams,
};
