'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { executeToolCall } = require('../src/core/tool-runner');
const storyStateStore = require('../src/core/story-state-store');
const fs = require('fs');
const path = require('path');

describe('tool-runner', () => {
  it('returns error for invalid JSON args', async () => {
    const result = await executeToolCall(
      { id: 'call_1', function: { name: 'test_tool', arguments: '{invalid' } },
      {},
      'test-agent'
    );
    assert.strictEqual(result.executed, false);
    assert.ok(result.result.includes('parse error'));
  });

  it('returns error for unknown tool', async () => {
    const result = await executeToolCall(
      { id: 'call_2', function: { name: 'missing_tool', arguments: '{}' } },
      {},
      'test-agent'
    );
    assert.strictEqual(result.executed, false);
    assert.ok(result.result.includes('Unknown tool'));
  });

  it('executes known tool', async () => {
    const result = await executeToolCall(
      { id: 'call_3', function: { name: 'echo', arguments: '{"msg":"hi"}' } },
      { echo: async (args) => args.msg },
      'test-agent'
    );
    assert.strictEqual(result.executed, true);
    assert.strictEqual(result.result, 'hi');
  });
});

describe('config-loader', () => {
  it('prefers LLM_API_KEY_{PROVIDER} env var', () => {
    const prev = process.env.LLM_API_KEY_GROK;
    process.env.LLM_API_KEY_GROK = 'env-test-key-abcdefghij';
    delete require.cache[require.resolve('../src/core/config-loader')];
    const { getProviderApiKey } = require('../src/core/config-loader');
    assert.strictEqual(getProviderApiKey('grok'), 'env-test-key-abcdefghij');
    if (prev === undefined) delete process.env.LLM_API_KEY_GROK;
    else process.env.LLM_API_KEY_GROK = prev;
    delete require.cache[require.resolve('../src/core/config-loader')];
  });
});

describe('story-state-store', () => {
  const testCharId = '__test_story__';
  const testFile = path.join(__dirname, '../data/story', `${testCharId}.json`);

  it('persists scenario and tension', () => {
    storyStateStore.triggerScenario(testCharId, {
      scenarioType: 'daily_interaction',
      context: 'test',
      goal: 'say hi',
    });
    storyStateStore.setTension(testCharId, 4);
    storyStateStore.advanceRelationship(testCharId, '暧昧期');

    const state = storyStateStore.getState(testCharId);
    assert.strictEqual(state.tensionLevel, 4);
    assert.strictEqual(state.relationshipStage, '暧昧期');
    assert.strictEqual(state.activeScenario?.scenarioType, 'daily_interaction');

    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });
});
