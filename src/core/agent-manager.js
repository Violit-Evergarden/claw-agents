'use strict';

const EventEmitter = require('events');

/**
 * AgentManager: 管理所有 Agent 实例的生命周期
 * 每个 Agent 是一个 { id, config, status, timer, messageQueue } 对象
 */
class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map(); // agentId -> AgentInstance
  }

  /**
   * 注册一个 Agent
   * @param {Object} agentConfig - { id, name, description, systemPrompt, tools, heartbeatInterval, platform }
   * @param {Function} runTurn - async (userMessage) => string  由外部注入执行逻辑
   */
  register(agentConfig, runTurn) {
    const { id } = agentConfig;
    if (this.agents.has(id)) {
      console.warn(`[AgentManager] Agent ${id} already registered, skipping`);
      return;
    }
    const instance = {
      id,
      config: agentConfig,
      status: 'idle',       // idle | running | error
      timer: null,
      messageQueue: [],
      runTurn,
      lastActive: null,
      logs: [],
    };
    this.agents.set(id, instance);
    console.log(`[AgentManager] Registered agent: ${id}`);
  }

  /**
   * 启动 Agent 的心跳循环（动态间隔版）
   *
   * 间隔策略（基于距上次用户互动的空闲时长）：
   *   ≤ 5  分钟：2  分钟  ← 对话热络，保持高敏感度
   *   ≤ 30 分钟：5  分钟  ← 刚聊完不久，适中跟进
   *   ≤ 1  小时：8  分钟  ← 稍微冷却
   *   ≤ 4  小时：12 分钟  ← 长时间没说话，降低频率
   *   >  4  小时：20 分钟  ← 深度空闲，最低频率
   *
   * config.heartbeatInterval 作为基准间隔（默认 120000ms），
   * 上述倍率基于此基准缩放，方便通过配置整体调节。
   */
  start(agentId) {
    const inst = this.agents.get(agentId);
    if (!inst) throw new Error(`Agent ${agentId} not found`);
    if (inst.timer) return; // 已启动

    inst.status = 'idle';

    // 启动后延迟 3 秒立即触发一次（让 Violet 在项目启动时就"活过来"）
    inst.timer = setTimeout(() => {
      this._scheduleNextHeartbeat(agentId);
    }, 3000);

    this.emit('agent:started', agentId);
    console.log(`[AgentManager] Agent ${agentId} started (dynamic interval, immediate wakeup in 3s)`);
  }

  /**
   * 根据当前空闲时长计算下一次心跳间隔（毫秒）
   */
  _calcHeartbeatInterval(inst) {
    const base = inst.config.heartbeatInterval || 120000; // 默认基准 2 分钟
    const idleMs = Date.now() - (inst.lastUserActive || 0);
    const idleMin = idleMs / 60000;

    let multiplier;
    if (idleMin <= 5)   multiplier = 1;    // 2 分钟
    else if (idleMin <= 30)  multiplier = 2.5;  // 5 分钟
    else if (idleMin <= 60)  multiplier = 4;    // 8 分钟
    else if (idleMin <= 240) multiplier = 6;    // 12 分钟
    else                     multiplier = 10;   // 20 分钟

    return Math.round(base * multiplier);
  }

  /**
   * 执行一次心跳，结束后按动态间隔调度下一次
   */
  async _scheduleNextHeartbeat(agentId) {
    const inst = this.agents.get(agentId);
    if (!inst || !inst.timer === undefined) return; // 已被 stop()

    if (inst.status !== 'running') {
      await this._runAgentHeartbeat(agentId);
    }

    const nextInterval = this._calcHeartbeatInterval(inst);
    const idleMin = ((Date.now() - (inst.lastUserActive || 0)) / 60000).toFixed(1);
    this._log(inst, `Next heartbeat in ${(nextInterval / 1000).toFixed(0)}s (idle ${idleMin}min)`);

    inst.timer = setTimeout(() => {
      this._scheduleNextHeartbeat(agentId);
    }, nextInterval);
  }

  /**
   * 向 Agent 推送用户消息（来自平台适配层）
   */
  async dispatchMessage(agentId, message, platform, meta = {}) {
    const inst = this.agents.get(agentId);
    if (!inst) {
      console.warn(`[AgentManager] No agent found for id: ${agentId}`);
      return;
    }
    inst.lastUserActive = Date.now(); // 记录最近用户活跃时间，用于心跳冷却判断
    this._log(inst, `Received message from ${platform}: ${message}`);
    await this._runAgentTurn(inst, message, platform, meta);
  }

  /**
   * 手动触发 Agent（来自 Dashboard）
   */
  async triggerManually(agentId) {
    const inst = this.agents.get(agentId);
    if (!inst) throw new Error(`Agent ${agentId} not found`);
    await this._runAgentTurn(inst, null);
  }

  /**
   * 停止 Agent
   */
  stop(agentId) {
    const inst = this.agents.get(agentId);
    if (!inst) return;
    if (inst.timer) {
      clearTimeout(inst.timer);
      inst.timer = null;
    }
    inst.status = 'idle';
    this.emit('agent:stopped', agentId);
    console.log(`[AgentManager] Agent ${agentId} stopped`);
  }

  /**
   * 热更新 Agent 的 systemPrompt（立即生效，无需重启）
   */
  updateSystemPrompt(agentId, systemPrompt) {
    const inst = this.agents.get(agentId);
    if (!inst) throw new Error(`Agent ${agentId} not found`);
    inst.config.systemPrompt = systemPrompt;
    console.log(`[AgentManager] systemPrompt updated for ${agentId} (${systemPrompt.length} chars)`);
  }

  getAll() {
    return Array.from(this.agents.values()).map(inst => ({
      id: inst.id,
      name: inst.config.name,
      description: inst.config.description,
      status: inst.status,
      lastActive: inst.lastActive,
      platform: inst.config.platform,
      logs: inst.logs.slice(-20),
    }));
  }

  getById(agentId) {
    const inst = this.agents.get(agentId);
    if (!inst) return null;
    return {
      id: inst.id,
      name: inst.config.name,
      description: inst.config.description,
      status: inst.status,
      lastActive: inst.lastActive,
      platform: inst.config.platform,
      systemPrompt: inst.config.systemPrompt || '',
      logs: inst.logs.slice(-50),
    };
  }

  // ── 内部方法 ──

  async _runAgentHeartbeat(agentId) {
    const inst = this.agents.get(agentId);

    // ── 静默窗口：深夜 0-7 点不主动调用 LLM（节省 token）──
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 7) {
      this._log(inst, `Heartbeat skipped (quiet hours ${hour}:00, 0-7 am)`);
      return;
    }

    const idleMs = Date.now() - (inst.lastUserActive || 0);
    const idleHours = idleMs / (1000 * 60 * 60);
    this._log(inst, `Heartbeat triggered (idle ${idleHours.toFixed(1)}h)`);
    await this._runAgentTurn(inst, null);
  }

  async _runAgentTurn(inst, userMessage, platform, meta = {}) {
    if (inst.status === 'running') {
      if (userMessage) {
        // 用户消息不丢弃，等当前 turn 结束后立即处理
        this._log(inst, `Already running, queuing message: ${userMessage}`);
        inst.messageQueue.push({ message: userMessage, platform, meta });
      } else {
        this._log(inst, 'Already running, skipping heartbeat turn');
      }
      return;
    }
    inst.status = 'running';
    inst.lastActive = new Date().toISOString();
    this.emit('agent:status', { id: inst.id, status: 'running' });

    const onLog = (level, msg) => {
      this._log(inst, msg, level);
    };

    inst.runTurn(userMessage, onLog, platform, meta)
      .then(() => {
        inst.status = 'idle';
        this.emit('agent:status', { id: inst.id, status: 'idle' });
        // 处理排队的消息
        if (inst.messageQueue.length > 0) {
          const next = inst.messageQueue.shift();
          this._runAgentTurn(inst, next.message, next.platform, next.meta);
        }
      })
      .catch(err => {
        inst.status = 'error';
        this._log(inst, `Error: ${err.message}`, 'error');
        this.emit('agent:status', { id: inst.id, status: 'error' });
        // 5秒后恢复 idle，并处理排队消息
        setTimeout(() => {
          if (inst.status === 'error') {
            inst.status = 'idle';
            if (inst.messageQueue.length > 0) {
              const next = inst.messageQueue.shift();
              this._runAgentTurn(inst, next.message, next.platform, next.meta);
            }
          }
        }, 5000);
      });
  }

  _log(inst, message, level = 'info') {
    const entry = { level, message, timestamp: new Date().toISOString() };
    inst.logs.push(entry);
    if (inst.logs.length > 200) inst.logs = inst.logs.slice(-200);
    this.emit('log', { agentId: inst.id, ...entry });
    console.log(`[${inst.id}][${level}] ${message}`);
  }
}

module.exports = new AgentManager(); // 单例
