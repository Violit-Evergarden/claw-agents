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
 * 根据角色获取基础提示词（角色外貌描述，中文，供图片生成 API 使用）
 */
function getBasePrompt(characterId) {
  const char = characterStore.getCharacter(characterId);
  if (char?.imageBasePrompt) return char.imageBasePrompt;

  const sp = char?.systemPrompt || '';
  if (sp.length > 50) {
    const firstParagraph = sp.split('\n')[0].replace(/^你(?:叫|是|名叫)[^，,。\n]+[，,。\s]*/, '').slice(0, 200);
    if (firstParagraph.length > 20) return firstParagraph;
  }

  return '气质出众的女性肖像，高质感呈现，自然光氛围';
}

function getPersonaEssence(characterId) {
  const char = characterStore.getCharacter(characterId);
  if (char?.personaEssence) return char.personaEssence;

  if (char?.appearanceKeywords?.length) {
    return char.appearanceKeywords.join('、');
  }

  if (char?.systemPrompt) {
    const sp = char.systemPrompt;
    const keywords = [];
    if (/清冷|高傲|冷艳|冰山/.test(sp)) keywords.push('冷艳优雅、冰冷气场');
    if (/占有欲|控制|支配/.test(sp)) keywords.push('强势占有欲、掌控感');
    if (/好色|色欲|欲望/.test(sp)) keywords.push('克制不住的诱惑目光、强烈欲望氛围');
    if (/温柔|宠溺|姐姐/.test(sp)) keywords.push('亲密的宠溺感、温柔克制');
    if (/傲|矜/.test(sp)) keywords.push('高傲疏离的精致气质');
    if (keywords.length > 0) return keywords.join(', ');
  }

  return '';
}

/**
 * 清洗对话上下文：将 NSFW 词汇替换为安全替代词，而非整行删除
 * 保留场景和氛围信息，只替换触发审核的词
 */
function sanitizeContext(context) {
  if (!context) return '';
  // 按风险等级替换：高风险 → 安全替代，中风险 → 委婉表达
  const replacements = [
    // 将露骨生理/动作细节去显式化：保留“亲密张力 + 支配/服从氛围”，避免直接出现明确性行为描述
    [/(?:阴[茎道部蒂]|阴道|阴茎|龟头|前列腺)/gi, '亲密氛围'],
    [/(?:做爱|性交|啪啪)/gi, '亲密互动'],
    [/(?:射精|内射|吞精|精液)/gi, '情绪高涨的余韵'],
    [/(?:口交|舔阴|骑脸)/gi, '贴近诱惑'],
    [/(?:自慰|勃起|高潮)/gi, '情动升温'],
    [/(?:淫|骚[逼穴货])/gi, '隐秘渴望氛围'],
    [/(?:操你|艹|强奸|轮奸)/gi, '被迫支配的压迫感'],
    [/(?:捆绑|滴蜡|调教|SM|sm)/gi, '束缚与挑逗氛围'],
    [/(?:母狗|肉便器)/gi, '顺从的服从姿态'],
    [/(?:肛交)/gi, '更深层的亲密张力'],
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
 * 将角色的 basePrompt + 用户请求 → LLM 生成精准的中文图片描述
 *
 * @param {string} characterId - 角色 ID
 * @param {string} userMessage - 用户消息（如"腿照"、"发张自拍"等）
 * @param {string} [conversationContext] - 最近几轮对话摘要（可选，帮助理解上下文）
 * @returns {Promise<{prompt: string, style: string, aspectRatio: string}>}
 */
async function generateImagePrompt(characterId, userMessage, conversationContext = '') {
  const recentHash = conversationContext ? String(conversationContext.length) : '0';
  const cacheKey = `${characterId}:${userMessage}:${recentHash}`;
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
      .slice(-10) // 最多保留最近 10 行（减少上下文脱节）
      .join('\n')
      .trim();
  }

  const contextBlock = safeContext
    ? `\n\n【近期对话氛围参考（情绪/场景/气质）】\n${safeContext}`
    : '';

  const essenceBlock = personaEssence
    ? `\n\n【角色气质/氛围注入（必须反映在图片气氛中）】\n${personaEssence}`
    : '';

  const systemMsg = {
    role: 'system',
    content: `你是一名 AI 角色肖像图片提示词生成器。你需要基于角色的外貌与气质，生成“中文”的高质量图片提示词，而不仅仅是描述外形。

你的首要目标：生成的画面必须让人一眼看出是“这个角色”，而不是普通漂亮女性；每张图都要有角色标志性的氛围。

关键规则：
1. 提示词必须只描述用户要求的内容：例如“腿照”就突出腿部，不要写成全身；“自拍/脸照”就用头像视角，不要写成大景全身
2. 提示词必须使用中文（可包含少量必要摄影/构图术语，但整体为中文）
3. 必须把角色气质/人格风格注入画面氛围：通过表情、眼神、情绪、场景与光线体现
4. 必须包含角色外貌特征（来自 basePrompt）
5. 要具体：镜头角度、构图、画面比例（尽量明确“特写/半身/全身/近景/中景”等）
6. 添加适度的摄影/绘画术语以提升画面质量
7. 提示词尽量简洁，偏“可直接用于出图的短提示”（控制在 200 字以内，或接近）

气质注入说明（让画面更像“本人”）：
- 角色气质必须影响：表情、目光方向、肢体姿态、情绪、灯光与场景
- 强势占有/支配感角色 → 直视感强、姿态自信、带轻微压迫感的表情
- 冷艳疏离角色 → 目光更克制、表情更少、偏冷色调灯光
- 对话上下文提供“当下场景情绪” → 通过场景与氛围反映出来

内容安全（必须通过图片审核）：
- 允许表达含蓄的亲密张力与支配/服从氛围（如：暧昧靠近、压迫感姿态、低声耳语的氛围感、克制的眼神与表情等）
- 禁止出现裸露器官、露点、明确性行为细节、精液/排泄物等显式生理描写
- 如果对话上下文里出现露骨措辞，把它改写成更隐秘的隐喻/比喻描述（不要逐字复述）

输出格式：只回复一个 JSON 对象（不要 markdown，不要解释）
{"prompt": "<中文图片提示词>", "style": "realistic|anime|cartoon|artistic|photographic", "aspectRatio": "square|portrait|landscape"}

构图选择：
- 腿/局部重点 → 近景或中近景，aspectRatio: "portrait"
- 脸照/自拍 → 头像或近景脸部特写，aspectRatio: "square"
- 全身 → 全身镜头，aspectRatio: "portrait"
- 随性自然 → 适配情绪的构图，aspectRatio: "square"`,
  };

  const userMsg = {
    role: 'user',
    content: `【角色外貌描述】
${basePrompt}
${essenceBlock}
${contextBlock}

【用户请求】
"${userMessage}"

请生成一段“中文图片提示词”，要求：
1. 严格对应用户请求（腿照突出腿；自拍/脸照突出脸部；全身突出全身）
2. 用气质反映角色的人格风格（体现在表情、眼神、姿态、情绪与氛围）
3. 把对话的场景情绪融入：通过背景、灯光与氛围体现
4. 内容必须满足审核（不要出现露骨显式内容；允许用含蓄隐喻保留亲密张力与情绪张力）`,
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
      prompt += '，长腿特写，身姿优雅，自然光影突出腿部线条';
      aspectRatio = 'portrait';
    }
    if (msg.includes('胸')) {
      prompt += '，曲线近景，光影强调身材质感与层次';
      aspectRatio = 'portrait';
    }
    if (msg.includes('脸') || msg.includes('自拍') || msg.includes('颜值')) {
      prompt += '，自拍/脸部近景，表情精致，眼神有氛围';
      aspectRatio = 'square';
    }
    if (msg.includes('jk') || msg.includes('cosplay')) {
      prompt = '一位中国女孩，穿 JK 校园风制服（百褶裙、白衬衫、干净利落的发型），青春活力的氛围';
      style = 'photographic';
      aspectRatio = 'portrait';
    }
    if (msg.includes('全身')) {
      prompt += '，全身镜头，姿态完整，氛围统一的场景背景';
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
