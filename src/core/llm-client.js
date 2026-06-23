'use strict';

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

/**
 * 读取最新配置（每次从磁盘读，支持运行时热更新）
 */
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * 保存配置到磁盘
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// 客户端实例缓存（按 baseURL+apiKey 缓存，避免重复创建）
const clientCache = new Map();

/**
 * 获取或创建 OpenAI 兼容客户端
 * @param {string} apiKey
 * @param {string} baseURL
 * @param {string} [proxy]  - 代理地址，如 "http://127.0.0.1:7890"
 */
function getClient(apiKey, baseURL, proxy) {
  const cacheKey = `${baseURL}::${apiKey}::${proxy || ''}`;
  if (!clientCache.has(cacheKey)) {
    const opts = { apiKey, baseURL };
    if (proxy) {
      opts.httpAgent = new HttpsProxyAgent(proxy);
      console.log(`[LLM] Using proxy ${proxy} for ${baseURL}`);
    }
    clientCache.set(cacheKey, new OpenAI(opts));
  }
  return clientCache.get(cacheKey);
}

/**
 * 获取当前激活的 provider 配置
 * 优先读 providers[activeProvider]，fallback 到顶层 llm 字段（兼容旧配置）
 */
function getActiveProviderConfig() {
  const config = loadConfig();
  const activeProvider = config.llm?.activeProvider || 'deepseek';
  const providers = config.providers || {};

  if (providers[activeProvider]) {
    const p = providers[activeProvider];
    return {
      provider: activeProvider,
      apiKey: p.apiKey,
      baseURL: p.baseURL,
      model: p.defaultModel || config.llm?.model || 'gpt-4o',
      memoryModel: p.memoryModel || p.defaultModel || config.llm?.model || 'gpt-4o',
      maxTokens: config.llm?.maxTokens || 2048,
      proxy: p.proxy || config.llm?.proxy || null,
    };
  }

  // fallback：使用顶层 llm 配置
  return {
    provider: 'custom',
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseURL,
    model: config.llm.model || 'gpt-4o',
    memoryModel: config.llm.memoryModel || config.llm.model || 'gpt-4o',
    maxTokens: config.llm.maxTokens || 2048,
    proxy: config.llm.proxy || null,
  };
}

/**
 * 获取所有 provider 列表（供 API 使用）
 */
function getProviders() {
  const config = loadConfig();
  const activeProvider = config.llm?.activeProvider || 'deepseek';
  const providers = config.providers || {};

  return {
    activeProvider,
    providers: Object.entries(providers).map(([id, p]) => ({
      id,
      name: p.name || id,
      baseURL: p.baseURL,
      models: p.models || [],
      defaultModel: p.defaultModel || '',
      memoryModel: p.memoryModel || '',
      hasApiKey: !!(p.apiKey && !p.apiKey.includes('YOUR_') && p.apiKey.length > 10),
    })),
  };
}

/**
 * 切换当前激活的 provider 和/或模型
 * @param {string} providerId - provider 名称（如 'grok', 'deepseek'）
 * @param {Object} [opts] - 可选：{ model, memoryModel, apiKey }
 */
function switchProvider(providerId, opts = {}) {
  const config = loadConfig();
  const providers = config.providers || {};

  if (!providers[providerId]) {
    throw new Error(`Provider "${providerId}" not found in config. Available: ${Object.keys(providers).join(', ')}`);
  }

  // 更新顶层 llm 字段（保持向下兼容）
  config.llm.activeProvider = providerId;
  config.llm.apiKey = opts.apiKey || providers[providerId].apiKey;
  config.llm.baseURL = providers[providerId].baseURL;
  config.llm.model = opts.model || providers[providerId].defaultModel;
  config.llm.memoryModel = opts.memoryModel || providers[providerId].memoryModel || providers[providerId].defaultModel;

  // 如果提供了新的 apiKey，同步更新 providers 里的配置
  if (opts.apiKey) {
    providers[providerId].apiKey = opts.apiKey;
  }
  if (opts.model) {
    providers[providerId].defaultModel = opts.model;
  }
  if (opts.memoryModel) {
    providers[providerId].memoryModel = opts.memoryModel;
  }

  saveConfig(config);
  console.log(`[LLM] Switched to provider: ${providerId}, model: ${config.llm.model}`);
  return getProviders();
}

/**
 * 更新指定 provider 的 API Key
 */
function updateProviderApiKey(providerId, apiKey) {
  const config = loadConfig();
  const providers = config.providers || {};

  if (!providers[providerId]) {
    throw new Error(`Provider "${providerId}" not found`);
  }

  providers[providerId].apiKey = apiKey;

  // 如果当前激活的就是该 provider，同步更新顶层 llm.apiKey
  if (config.llm?.activeProvider === providerId) {
    config.llm.apiKey = apiKey;
  }

  saveConfig(config);
  console.log(`[LLM] Updated API key for provider: ${providerId}`);
}

/**
 * LLM 错误类型
 */
class LLMError extends Error {
  constructor(message, { code, status, retryable = false } = {}) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function classifyError(err) {
  const status = err.status || err.response?.status;
  if (status === 401 || status === 403) {
    return new LLMError(err.message, { code: 'AUTH_ERROR', status, retryable: false });
  }
  if (status === 429) {
    return new LLMError(err.message, { code: 'RATE_LIMIT', status, retryable: true });
  }
  if (status >= 500) {
    return new LLMError(err.message, { code: 'SERVER_ERROR', status, retryable: true });
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
    return new LLMError(err.message, { code: 'TIMEOUT', retryable: true });
  }
  return new LLMError(err.message, { code: 'UNKNOWN', retryable: false });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 发起 LLM 调用，支持工具调用与重试
 */
async function chat(messages, tools = [], agentId = 'unknown', opts = {}) {
  const providerCfg = getActiveProviderConfig();
  const apiKey = providerCfg.apiKey;
  const baseURL = providerCfg.baseURL;
  const model = opts.model || providerCfg.model;
  const maxTokens = opts.maxTokens || providerCfg.maxTokens;
  const proxy = providerCfg.proxy || null;
  const maxRetries = opts.maxRetries ?? 2;

  const openai = getClient(apiKey, baseURL, proxy);

  const params = {
    model,
    messages,
    max_tokens: maxTokens,
  };

  if (tools.length > 0) {
    params.tools = tools;
    params.tool_choice = 'auto';
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[LLM][${agentId}] provider=${providerCfg.provider} model=${model} messages=${messages.length} tools=${tools.length}${attempt > 0 ? ` retry=${attempt}` : ''}`);
      const response = await openai.chat.completions.create(params);
      const message = response.choices[0].message;
      console.log(`[LLM][${agentId}] Response: finish_reason=${response.choices[0].finish_reason}`);
      return message;
    } catch (err) {
      lastError = classifyError(err);
      if (!lastError.retryable || attempt >= maxRetries) {
        throw lastError;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[LLM][${agentId}] Retryable error (${lastError.code}), waiting ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

module.exports = {
  chat,
  getProviders,
  switchProvider,
  updateProviderApiKey,
  getActiveProviderConfig,
  LLMError,
};
