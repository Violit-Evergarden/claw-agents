'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');
const ENV_PATH = path.join(__dirname, '../../.env');

// 启动时加载 .env（本地开发）；云服务器可直接注入环境变量
require('dotenv').config({ path: ENV_PATH });

/** @type {Map<string, string>} Dashboard 临时写入的 API Key（重启后失效） */
const runtimeApiKeys = new Map();

function envKeyForProvider(providerId) {
  return `LLM_API_KEY_${String(providerId).toUpperCase().replace(/-/g, '_')}`;
}

function isValidApiKey(key) {
  return !!(key && !key.includes('YOUR_') && key.length >= 10);
}

function loadRawConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * 获取指定 provider 的 API Key
 * 优先级：LLM_API_KEY_{PROVIDER} > 运行时覆盖 > LLM_API_KEY（仅当前激活 provider）> config.json 遗留字段
 */
function getProviderApiKey(providerId) {
  const id = String(providerId);
  const envSpecific = process.env[envKeyForProvider(id)];
  if (envSpecific) return envSpecific;

  if (runtimeApiKeys.has(id)) return runtimeApiKeys.get(id);

  const raw = loadRawConfig();
  const active = raw.llm?.activeProvider;
  if (active === id && process.env.LLM_API_KEY) {
    return process.env.LLM_API_KEY;
  }

  const legacy = raw.providers?.[id]?.apiKey
    || (active === id ? raw.llm?.apiKey : '');
  return legacy || '';
}

function hasProviderApiKey(providerId) {
  return isValidApiKey(getProviderApiKey(providerId));
}

/**
 * Dashboard 临时设置 API Key（写入当前进程环境变量，重启后需配置 .env 或云环境变量）
 */
function setProviderApiKey(providerId, apiKey) {
  const id = String(providerId);
  runtimeApiKeys.set(id, apiKey);
  process.env[envKeyForProvider(id)] = apiKey;
}

function getBotAppSecret(bot, index) {
  const envByIndex = process.env[`QQ_APP_SECRET_${index}`];
  if (envByIndex) return envByIndex;

  const agentId = bot.agentId || '';
  if (agentId) {
    const envByAgent = process.env[`QQ_APP_SECRET_${agentId.toUpperCase()}`];
    if (envByAgent) return envByAgent;
  }

  return bot.appSecret || '';
}

function stripSecrets(config) {
  const copy = JSON.parse(JSON.stringify(config));
  if (copy.llm) delete copy.llm.apiKey;
  if (copy.providers) {
    for (const p of Object.values(copy.providers)) {
      delete p.apiKey;
    }
  }
  if (Array.isArray(copy.bots)) {
    for (const b of copy.bots) {
      delete b.appSecret;
    }
  }
  return copy;
}

function applySecrets(config) {
  const activeProvider = config.llm?.activeProvider;

  if (config.providers) {
    for (const id of Object.keys(config.providers)) {
      config.providers[id].apiKey = getProviderApiKey(id);
    }
  }

  if (activeProvider) {
    config.llm = config.llm || {};
    config.llm.apiKey = getProviderApiKey(activeProvider);
  } else if (process.env.LLM_API_KEY) {
    config.llm = config.llm || {};
    config.llm.apiKey = process.env.LLM_API_KEY;
  }

  if (Array.isArray(config.bots)) {
    config.bots = config.bots.map((bot, index) => ({
      ...bot,
      appSecret: getBotAppSecret(bot, index),
    }));
  }

  return config;
}

/**
 * 从 config.json 加载配置，密钥一律来自环境变量（或运行时临时覆盖）
 */
function loadConfig() {
  const config = loadRawConfig();
  return applySecrets(config);
}

/**
 * 保存非敏感配置到 config.json（自动剥离 apiKey / appSecret）
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(stripSecrets(config), null, 2), 'utf8');
}

/**
 * 定时任务（cron）是否启用
 */
function isSchedulerEnabled() {
  const env = process.env.SCHEDULER_ENABLED;
  if (env === '0' || env === 'false') return false;
  const config = loadRawConfig();
  return config.scheduler?.enabled !== false;
}

function validateConfig(config) {
  const errors = [];
  const activeProvider = config.llm?.activeProvider || Object.keys(config.providers || {})[0] || 'deepseek';
  const apiKey = getProviderApiKey(activeProvider);

  if (!isValidApiKey(apiKey)) {
    errors.push(
      `LLM API Key 未配置：请设置环境变量 LLM_API_KEY_${activeProvider.toUpperCase()} 或 LLM_API_KEY`
    );
  }

  if (Array.isArray(config.bots)) {
    config.bots.forEach((bot, index) => {
      if (bot.enabled === false) return;
      const secret = getBotAppSecret(bot, index);
      if (!secret) {
        const hint = bot.agentId
          ? `QQ_APP_SECRET_${index} 或 QQ_APP_SECRET_${bot.agentId.toUpperCase()}`
          : `QQ_APP_SECRET_${index}`;
        errors.push(`Bot [${bot.agentId || index}] 缺少 AppSecret，请设置 ${hint}`);
      }
    });
  }

  return errors;
}

module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  getProviderApiKey,
  setProviderApiKey,
  hasProviderApiKey,
  getBotAppSecret,
  isSchedulerEnabled,
  CONFIG_PATH,
  ENV_PATH,
};
