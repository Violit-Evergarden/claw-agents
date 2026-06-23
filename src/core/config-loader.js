'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

/**
 * 从 config.json 加载配置，并用环境变量覆盖敏感字段
 */
function loadConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // LLM API Key 环境变量覆盖
  if (process.env.LLM_API_KEY) {
    config.llm = config.llm || {};
    config.llm.apiKey = process.env.LLM_API_KEY;
  }

  const activeProvider = config.llm?.activeProvider;
  if (activeProvider && process.env[`LLM_API_KEY_${activeProvider.toUpperCase()}`]) {
    const key = process.env[`LLM_API_KEY_${activeProvider.toUpperCase()}`];
    if (config.providers?.[activeProvider]) {
      config.providers[activeProvider].apiKey = key;
    }
    config.llm.apiKey = key;
  }

  // Bot secrets 环境变量覆盖: QQ_APP_SECRET_0, QQ_APP_SECRET_1, ...
  if (Array.isArray(config.bots)) {
    config.bots.forEach((bot, index) => {
      const envKey = process.env[`QQ_APP_SECRET_${index}`] || process.env[`QQ_APP_SECRET_${bot.agentId?.toUpperCase()}`];
      if (envKey) bot.appSecret = envKey;
    });
  }

  return config;
}

/**
 * 定时任务（cron）是否启用；默认 true，config.scheduler.enabled=false 或 SCHEDULER_ENABLED=0 时禁用
 */
function isSchedulerEnabled() {
  const env = process.env.SCHEDULER_ENABLED;
  if (env === '0' || env === 'false') return false;
  const config = loadConfig();
  return config.scheduler?.enabled !== false;
}

function validateConfig(config) {
  const errors = [];
  const apiKey = config.llm?.apiKey;
  if (!apiKey || apiKey.includes('YOUR_') || apiKey.length < 10) {
    errors.push('LLM apiKey 未配置或仍为占位符，请设置 config.json 或环境变量 LLM_API_KEY');
  }
  return errors;
}

module.exports = { loadConfig, validateConfig, CONFIG_PATH, isSchedulerEnabled };
