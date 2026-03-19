'use strict';

const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '../../data/tasks.json');

function _load() {
  if (!fs.existsSync(TASKS_FILE)) return { tasks: [] };
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
}

function _save(data) {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getAll() {
  return _load().tasks;
}

function getById(id) {
  return _load().tasks.find(t => t.id === id) || null;
}

function upsert(task) {
  const data = _load();
  const idx = data.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    data.tasks[idx] = { ...data.tasks[idx], ...task };
  } else {
    data.tasks.push(task);
  }
  _save(data);
}

function remove(id) {
  const data = _load();
  data.tasks = data.tasks.filter(t => t.id !== id);
  _save(data);
}

function updateStatus(id, status) {
  const data = _load();
  const task = data.tasks.find(t => t.id === id);
  if (task) {
    task.status = status;
    task.updatedAt = new Date().toISOString();
    _save(data);
  }
}

/**
 * 记录一次任务执行历史
 */
function appendHistory(id, result) {
  const data = _load();
  const task = data.tasks.find(t => t.id === id);
  if (task) {
    task.history = task.history || [];
    task.history.push({ timestamp: new Date().toISOString(), result });
    if (task.history.length > 10) task.history = task.history.slice(-10);
    task.lastRun = new Date().toISOString();
    _save(data);
  }
}

module.exports = { getAll, getById, upsert, remove, updateStatus, appendHistory };
