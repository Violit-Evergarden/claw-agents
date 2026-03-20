'use strict';

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const taskStore = require('./task-store');

/**
 * CronManager: 管理所有定时任务
 * 启动时从 tasks.json 恢复持久化任务
 */
class CronManager extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // taskId -> cron.ScheduledTask
    this.executor = null;  // 注入任务执行器
  }

  /**
   * 注入任务执行器（避免循环依赖）
   * @param {Function} executor - async (task) => string
   */
  setExecutor(executor) {
    this.executor = executor;
  }

  /**
   * 从持久化存储恢复所有 active 任务
   */
  restoreFromStore() {
    const tasks = taskStore.getAll();
    let restored = 0;
    for (const task of tasks) {
      if (task.status === 'active') {
        this._scheduleJob(task);
        restored++;
      }
    }
    console.log(`[CronManager] Restored ${restored} tasks from store`);
  }

  /**
   * 添加新任务（由 Agent 通过 schedule_task tool 调用）
   * @param {Object} opts - { cronExpr, action, description, content, platform, agentId }
   * @returns {string} taskId
   */
  addTask(opts) {
    const { cronExpr, action, description, content, platform, agentId } = opts;

    if (!cron.validate(cronExpr)) {
      throw new Error(`Invalid cron expression: ${cronExpr}`);
    }

    const taskId = uuidv4();
    const task = {
      id: taskId,
      cronExpr,
      action,
      description,
      content: content || '',
      platform: platform || 'console',
      agentId: agentId || 'unknown',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRun: null,
      history: [],
    };

    taskStore.upsert(task);
    this._scheduleJob(task);
    this.emit('task:added', task);
    console.log(`[CronManager] Added task: ${taskId} "${description}" (${cronExpr})`);
    return taskId;
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId) {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      taskStore.updateStatus(taskId, 'paused');
      this.emit('task:paused', taskId);
      console.log(`[CronManager] Paused task: ${taskId}`);
    }
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId) {
    const task = taskStore.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (this.jobs.has(taskId)) {
      const job = this.jobs.get(taskId);
      job.start();
    } else {
      this._scheduleJob(task);
    }
    taskStore.updateStatus(taskId, 'active');
    this.emit('task:resumed', taskId);
  }

  /**
   * 删除任务
   */
  removeTask(taskId) {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
    taskStore.remove(taskId);
    this.emit('task:removed', taskId);
    console.log(`[CronManager] Removed task: ${taskId}`);
  }

  /**
   * 立即触发任务（手动）
   */
  async triggerNow(taskId) {
    const task = taskStore.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    await this._executeTask(task);
  }

  getAllTasks() {
    return taskStore.getAll();
  }

  // ── 内部方法 ──

  _scheduleJob(task) {
    if (this.jobs.has(task.id)) return;
    const job = cron.schedule(task.cronExpr, async () => {
      await this._executeTask(task);
    }, { timezone: 'Asia/Shanghai' });
    this.jobs.set(task.id, job);
  }

  async _executeTask(task) {
    console.log(`[CronManager] Executing task: ${task.id} "${task.description}"`);
    this.emit('task:triggered', task);
    let result = 'ok';
    if (this.executor) {
      result = await this.executor(task);
    }
    taskStore.appendHistory(task.id, result);
    this.emit('task:executed', { task, result });

    // 执行完毕后自动删除任务（所有定时任务默认一次性执行，不重复）
    this.removeTask(task.id);
    console.log(`[CronManager] Task auto-removed after execution: ${task.id}`);
  }
}

module.exports = new CronManager(); // 单例
