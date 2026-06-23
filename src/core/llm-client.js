'use strict';

const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  loadConfig,
  saveConfig,
  setProviderApiKey,
  hasProviderApiKey,
} = require('./config-loader');

// 客户端实例缓存（按 baseURL+apiKey 缓存，避免重复创建）
const clientCache = new Map();

function clearClientCache() {
  clientCache.clear();
}

/**
 * 获取或创建 OpenAI 兼容客户端
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
      hasApiKey: hasProviderApiKey(id),
    })),
  };
}

/**
 * 切换当前激活的 provider 和/或模型
 */
function switchProvider(providerId, opts = {}) {
  const config = loadConfig();
  const providers = config.providers || {};

  if (!providers[providerId]) {
    throw new Error(`Provider "${providerId}" not found in config. Available: ${Object.keys(providers).join(', ')}`);
  }

  config.llm.activeProvider = providerId;
  config.llm.baseURL = providers[providerId].baseURL;
  config.llm.model = opts.model || providers[providerId].defaultModel;
  config.llm.memoryModel = opts.memoryModel || providers[providerId].memoryModel || providers[providerId].defaultModel;

  if (opts.model) {
    providers[providerId].defaultModel = opts.model;
  }
  if (opts.memoryModel) {
    providers[providerId].memoryModel = opts.memoryModel;
  }

  saveConfig(config);
  clearClientCache();
  console.log(`[LLM] Switched to provider: ${providerId}, model: ${config.llm.model}`);
  return getProviders();
}

/**
 * 更新指定 provider 的 API Key（当前进程有效；持久化请配置环境变量）
 */
function updateProviderApiKey(providerId, apiKey) {
  const config = loadConfig();
  const providers = config.providers || {};

  if (!providers[providerId]) {
    throw new Error(`Provider "${providerId}" not found`);
  }

  setProviderApiKey(providerId, apiKey);
  clearClientCache();
  console.log(`[LLM] Updated API key for provider: ${providerId} (runtime only; set LLM_API_KEY_${providerId.toUpperCase()} to persist)`);
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
