'use strict';

const fs = require('fs');
const path = require('path');

const STORY_DIR = path.join(__dirname, '../../data/story');

const DEFAULT_STATE = {
  relationshipStage: '初识',
  tensionLevel: 1,
  activeScenario: null,
  scenarioHistory: [],
  lastUpdated: null,
};

function ensureDir() {
  if (!fs.existsSync(STORY_DIR)) {
    fs.mkdirSync(STORY_DIR, { recursive: true });
  }
}

function storyFile(charId) {
  return path.join(STORY_DIR, `${charId}.json`);
}

function load(charId) {
  ensureDir();
  const file = storyFile(charId);
  if (!fs.existsSync(file)) {
    return { ...DEFAULT_STATE, lastUpdated: new Date().toISOString() };
  }
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...DEFAULT_STATE, lastUpdated: new Date().toISOString() };
  }
}

function save(charId, state) {
  ensureDir();
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(storyFile(charId), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function getState(charId) {
  return load(charId);
}

function triggerScenario(charId, { scenarioType, context, goal }) {
  const state = load(charId);
  state.activeScenario = { scenarioType, context: context || '', goal: goal || '', startedAt: new Date().toISOString() };
  state.scenarioHistory.push({ ...state.activeScenario });
  if (state.scenarioHistory.length > 50) {
    state.scenarioHistory = state.scenarioHistory.slice(-50);
  }
  return save(charId, state);
}

function setTension(charId, level) {
  const state = load(charId);
  state.tensionLevel = Math.max(1, Math.min(5, parseInt(level, 10) || 1));
  return save(charId, state);
}

function advanceRelationship(charId, targetStage) {
  const state = load(charId);
  state.relationshipStage = targetStage || state.relationshipStage;
  return save(charId, state);
}

function getSummaryForPrompt(charId) {
  const state = load(charId);
  const lines = [];
  lines.push(`关系阶段：${state.relationshipStage}`);
  lines.push(`剧情张力：${state.tensionLevel}/5`);
  if (state.activeScenario) {
    lines.push(`当前场景：${state.activeScenario.scenarioType} — ${state.activeScenario.goal}`);
  }
  return lines.join('\n');
}

module.exports = {
  getState,
  triggerScenario,
  setTension,
  advanceRelationship,
  getSummaryForPrompt,
  DEFAULT_STATE,
};
