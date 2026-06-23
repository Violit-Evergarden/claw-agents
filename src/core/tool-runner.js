'use strict';

/**
 * 执行单个 tool call，含 JSON 解析容错
 * @returns {{ result: string, executed: boolean }}
 */
async function executeToolCall(toolCall, toolExecutors, agentId, onLog = () => {}) {
  const { id: callId, function: fn } = toolCall;
  const log = (msg) => onLog('info', msg);
  const logErr = (msg) => onLog('error', msg);

  let args = {};
  try {
    args = JSON.parse(fn.arguments || '{}');
  } catch (err) {
    logErr(`[${agentId}] Tool args parse failed for ${fn.name}: ${err.message}`);
    return {
      callId,
      result: `Tool arguments parse error: ${err.message}`,
      executed: false,
    };
  }

  log(`[${agentId}] Tool call: ${fn.name}(${JSON.stringify(args)})`);

  if (!toolExecutors[fn.name]) {
    logErr(`[${agentId}] Unknown tool: ${fn.name}`);
    return { callId, result: `Unknown tool: ${fn.name}`, executed: false };
  }

  try {
    const result = await toolExecutors[fn.name](args, agentId);
    return {
      callId,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      executed: true,
    };
  } catch (err) {
    logErr(`[${agentId}] Tool ${fn.name} failed: ${err.message}`);
    return { callId, result: `Tool execution error: ${err.message}`, executed: false };
  }
}

/**
 * 执行一批 tool calls
 * @returns {{ results: Array, executedCount: number }}
 */
async function executeToolCalls(toolCalls, toolExecutors, agentId, onLog = () => {}) {
  const results = [];
  let executedCount = 0;

  for (const toolCall of toolCalls) {
    const { callId, result, executed } = await executeToolCall(toolCall, toolExecutors, agentId, onLog);
    results.push({ callId, result });
    if (executed) executedCount++;
  }

  return { results, executedCount };
}

module.exports = { executeToolCall, executeToolCalls };
