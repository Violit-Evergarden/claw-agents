'use strict';

const llmClient = require('../../core/llm-client');
const characterStore = require('../../core/character-store');

/**
 * 图片生成触发器
 * 职责：
 * 1. 即时图片请求 → shouldTriggerImageGeneration() 返回 true → 由 config.js 直接生成
 * 2. 定时图片请求 → isScheduledImageRequest() 返回 true → 由 config.js 创建定时任务
 * 3. 智能提示词生成 → generateImagePrompt() 用 LLM 理解用户意图 + 角色 basePrompt
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
 * 根据角色获取基础提示词（角色外貌描述，纯英文，供图片生成 API 使用）
 */
function getBasePrompt(characterId) {
  const prompts = {
    christina: '24岁，亚洲女生，身高172cm，拥有极致完美的身材：肤白如瓷、貌美惊艳、胸部丰满（E杯以上）、细腰翘臀、长腿修直。黑长直微卷长发垂至腰际，眉眼锋利冷艳，五官精致立体，唇色天然淡红，整体气质清冷高傲，像一朵不可亵玩的冰山雪莲，却在面对弟弟时会瞬间转为极度占有欲和色欲的支配者',
    shuangqing: 'a beautiful ethereal fairy woman with cold aura, icy blue background, traditional Chinese celestial style, long dark hair, elegant white robes, misty atmosphere, portrait, high quality',
  };
  return prompts[characterId] || 'a beautiful woman, portrait, high quality, natural lighting';
}

/**
 * 从角色的 systemPrompt 中提取气质/人设关键词（纯英文）
 * 这些关键词用于给图片注入角色的"灵魂"，让图片不仅仅是好看，还符合角色气质
 *
 * @param {string} characterId
 * @returns {string} 英文气质描述词，如 "possessive, dominant, cold and arrogant, controlling aura"
 */
function getPersonaEssence(characterId) {
  // 预定义的角色气质关键词（从 systemPrompt 中人工提炼的精华）
  // 图片 API 不理解中文人设，需要转换为英文视觉氛围词
  const essenceMap = {
    christina: 'possessive dominant older sister energy, cold arrogant gaze with underlying desire, commanding and controlling aura, seductively intimidating, yandere obsessiveness visible in eyes, captivating dangerous beauty, intimate predatory elegance',
    shuangqing: 'ethereal otherworldly fairy aura, proud and aloof beauty, reluctant vulnerability beneath cold exterior, ancient celestial grace, misty mysterious atmosphere, untouchable goddess presence',
  };

  // 尝试从角色 JSON 动态提取（后备方案）
  if (!essenceMap[characterId]) {
    try {
      const char = characterStore.getCharacter(characterId);
      if (char?.systemPrompt) {
        // 从 systemPrompt 中提取气质关键词，转换为英文视觉词
        const sp = char.systemPrompt;
        const keywords = [];
        if (/清冷|高傲|冷艳|冰山/.test(sp)) keywords.push('cold elegant beauty, icy aura');
        if (/占有欲|控制|支配/.test(sp)) keywords.push('possessive commanding presence');
        if (/好色|色欲|欲望/.test(sp)) keywords.push('seductive alluring gaze');
        if (/温柔|宠溺|姐姐/.test(sp)) keywords.push('warm intimate tenderness');
        if (/傲|矜/.test(sp)) keywords.push('proud aloof elegance');
        if (keywords.length > 0) return keywords.join(', ');
      }
    } catch (e) {
      // characterStore 可能未初始化
    }
  }

  return essenceMap[characterId] || '';
}

/**
 * 清洗对话上下文：将 NSFW 词汇替换为安全替代词，而非整行删除
 * 保留场景和氛围信息，只替换触发审核的词
 */
function sanitizeContext(context) {
  if (!context) return '';
  // 按风险等级替换：高风险 → 安全替代，中风险 → 委婉表达
  const replacements = [
    [/(?:阴[茎道部蒂]|阴道|阴茎|龟头|前列腺)/gi, '身体'],
    [/(?:做爱|性交|啪啪)/gi, '亲密'],
    [/(?:射精|内射|吞精|精液)/gi, '亲密时刻'],
    [/(?:口交|舔阴|骑脸)/gi, '亲密接触'],
    [/(?:自慰|勃起|高潮)/gi, '情动'],
    [/(?:淫|骚[逼穴货])/gi, '渴望'],
    [/(?:操你|艹|强奸|轮奸)/gi, '强制'],
    [/(?:捆绑|滴蜡|调教|SM|sm)/gi, '特殊互动'],
    [/(?:母狗|肉便器)/gi, '专属'],
    [/(?:肛交)/gi, '后庭亲密'],
  ];

  let safe = context;
  for (const [pattern, replacement] of replacements) {
    safe = safe.replace(pattern, replacement);
  }
  return safe;
}

// 提示词生成缓存（避免对相同请求重复调用 LLM）
const promptCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 清空 prompt 缓存（当图片被审核拒绝时可手动调用）
 */
function clearPromptCache() {
  promptCache.clear();
  console.log('[ImageTrigger] Prompt cache cleared');
}

/**
 * 用 LLM 智能生成图片提示词
 * 将角色的 basePrompt + 用户请求 → LLM 生成精准的英文图片描述
 *
 * @param {string} characterId - 角色 ID
 * @param {string} userMessage - 用户消息（如"腿照"、"发张自拍"等）
 * @param {string} [conversationContext] - 最近几轮对话摘要（可选，帮助理解上下文）
 * @returns {Promise<{prompt: string, style: string, aspectRatio: string}>}
 */
async function generateImagePrompt(characterId, userMessage, conversationContext = '') {
  // 缓存命中
  const cacheKey = `${characterId}:${userMessage}`;
  const cached = promptCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`[ImageTrigger] Using cached prompt for: "${userMessage.substring(0, 20)}"`);
    return cached.data;
  }

  const basePrompt = getBasePrompt(characterId);
  const personaEssence = getPersonaEssence(characterId);

  // 清洗对话上下文：将 NSFW 词汇替换为安全替代词，保留场景氛围
  let safeContext = '';
  if (conversationContext) {
    safeContext = sanitizeContext(conversationContext)
      .split('\n')
      .slice(-6) // 最多保留最近 6 行
      .join('\n')
      .trim();
  }

  const contextBlock = safeContext
    ? `\n\n【Recent Conversation Context (for mood/scene/atmosphere reference)】\n${safeContext}`
    : '';

  const essenceBlock = personaEssence
    ? `\n\n【Character Persona / Vibe (MUST be reflected in the image's atmosphere)】\n${personaEssence}`
    : '';

  const systemMsg = {
    role: 'system',
    content: `You are an expert image prompt generator for AI character roleplay portraits. You create precise, high-quality English prompts that capture the CHARACTER'S UNIQUE PERSONALITY and VIBE, not just their physical appearance.

YOUR #1 PRIORITY: The generated image MUST feel like THIS specific character, not a generic pretty woman. Every image should have the character's signature atmosphere.

CRITICAL RULES:
1. The prompt MUST describe ONLY what the user asked for - if they want leg photos, focus on legs, NOT full body
2. The prompt MUST be in English only
3. MUST incorporate the character's persona/vibe into the image atmosphere (through expression, gaze, mood, setting, lighting)
4. Include the character's appearance features from the base description
5. Be specific about camera angle, framing, and composition
6. Add appropriate photography/artistic terms for quality
7. Keep the prompt concise (under 200 words)

PERSONA INJECTION — This is what makes images feel authentic:
- The character's persona/vibe MUST influence: facial expression, gaze direction, body language, mood, lighting, setting
- A possessive/dominant character → intense direct gaze, confident posture, slightly predatory smile
- A cold/alooft character → distant gaze, minimal expression, cool-toned lighting
- Conversation context provides the SCENE MOOD — reflect it through setting and atmosphere
- Example: if the conversation is playful/flirty, the image should have warm intimate lighting and a teasing expression

CONTENT SAFETY — Required to pass the image API's content moderation:
- NEVER use: nude, naked, sex, erotic, pornographic, hentai, bare breasts, exposed genitals, etc.
- Use tasteful fashion-editorial language instead of explicit terms
- "E-cup" → "curvy figure" / "voluptuous silhouette"
- Bare skin → "sheer fabric" / "dramatic lighting on curves"
- Sensual mood → "intimate atmosphere" / "soft warm lighting" / "alluring gaze"
- Goal: romantic, intimate, alluring — NOT pornographic

Output format - respond ONLY with a JSON object (no markdown, no explanation):
{"prompt": "<english image prompt>", "style": "realistic|anime|cartoon|artistic|photographic", "aspectRatio": "square|portrait|landscape"}

Framing guidelines:
- Leg/body part focus → close-up or medium shot, aspectRatio: "portrait"
- Face/selfie → close-up face shot, aspectRatio: "square"
- Full body → full body shot, aspectRatio: "portrait"
- Casual/natural → whatever fits the mood, aspectRatio: "square"`,
  };

  const userMsg = {
    role: 'user',
    content: `【Character Appearance】
${basePrompt}
${essenceBlock}
${contextBlock}

【User's Request】
"${userMessage}"

Generate an image prompt that:
1. Precisely matches what the user asked for (leg photo = focus on legs, selfie = face close-up)
2. Reflects the character's PERSONA in the image's mood, expression, and atmosphere
3. Incorporates the CONVERSATION SCENE into the setting/lighting/mood
4. Passes content moderation (no explicit terms)`,
  };

  try {
    console.log(`[ImageTrigger] Generating smart prompt for: "${userMessage}" (charId=${characterId})`);
    const response = await llmClient.chat([systemMsg, userMsg], [], 'image-prompt-gen', {
      maxTokens: 300,
    });

    const raw = (response.content || '').trim();
    console.log(`[ImageTrigger] LLM response: ${raw.substring(0, 100)}`);

    // 解析 JSON
    let parsed;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn(`[ImageTrigger] JSON parse failed, using raw as prompt: ${e.message}`);
        parsed = null;
      }
    }

    const result = {
      prompt: parsed?.prompt || raw,
      style: ['realistic', 'anime', 'cartoon', 'artistic', 'photographic'].includes(parsed?.style)
        ? parsed.style
        : 'realistic',
      aspectRatio: ['square', 'portrait', 'landscape'].includes(parsed?.aspectRatio)
        ? parsed.aspectRatio
        : 'square',
    };

    console.log(`[ImageTrigger] Final prompt: "${result.prompt.substring(0, 80)}..." (style=${result.style}, ratio=${result.aspectRatio})`);

    // 缓存结果
    promptCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error(`[ImageTrigger] LLM prompt generation failed, falling back to simple method: ${error.message}`);
    // LLM 失败时 fallback 到简单拼接
    return getImageGenerationParamsFallback(characterId, userMessage);
  }
}

/**
 * Fallback：简单关键词拼接（仅在 LLM 生成失败时使用）
 */
function getImageGenerationParamsFallback(characterId, userMessage = null) {
  let style = 'realistic';
  let aspectRatio = 'square';
  let prompt = getBasePrompt(characterId);

  if (userMessage) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('腿')) {
      prompt += ', close-up shot of long slender legs, elegant posture';
      aspectRatio = 'portrait';
    }
    if (msg.includes('胸')) {
      prompt += ', close-up of attractive curves';
      aspectRatio = 'portrait';
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

/**
 * 动态组合提示词（同步版本，保留兼容）
 * @deprecated 使用 generateImagePrompt() 替代
 */
function getImageGenerationParams(characterId, userMessage = null) {
  return getImageGenerationParamsFallback(characterId, userMessage);
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
  getImageGenerationParams,  // 同步 fallback 版本（保留兼容）
  generateImagePrompt,       // 新：LLM 智能生成版本（异步）
  getBasePrompt,
  getPersonaEssence,         // 角色气质关键词
  clearPromptCache,          // 清空缓存
};
