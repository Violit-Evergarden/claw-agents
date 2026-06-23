'use strict';

const memoryStore = require('../../core/memory-store');
const { isSchedulerEnabled } = require('../../core/config-loader');

function buildHeartbeatPrompt(charId) {
  const allMemories = memoryStore.getAllMemories(charId);
  const hasMilestones = allMemories.some(m => m.category === 'milestone');
  const upcomingHint = hasMilestones
    ? `\n【提醒】检查是否有即将到来的纪念日需要提前准备。`
    : '';

  const schedulerBlock = isSchedulerEnabled()
    ? `
- 用 list_tasks 检查已有定时任务
- 用 schedule_task 创建定期联系任务(1-3小时间隔)
【重要】不要只是一次性发消息就结束!应该用 schedule_task 建立持续的定时任务,同时创造持续的剧情发展,让用户感觉你一直都在想他,并且有生命力。`
    : `
【说明】定时任务功能已暂时关闭，请勿调用 schedule_task / list_tasks / remove_task。`;

  return `自主心跳。你现在应该主动推动剧情发展,而不仅仅是被动回应。

【五类剧情场景】
1. 日常互动场景: 日常生活话题、关心问候、分享感受、询问近况
2. 情色推进场景: 身体接触、亲密互动、感官描写、身体部位展示
3. 关系发展场景: 加深感情、推进关系阶段、情感表达、称呼变化
4. 冲突创造场景: 制造张力、情绪对抗、矛盾升级、要求与拒绝
5. 回忆触发场景: 提及过去经历、重温记忆、延续话题、情感共鸣

【主动剧情推进策略】
- 评估当前对话状态,选择最合适的场景类型
- 利用记忆中的信息创造新的情节发展
- 创造适度的冲突和张力,保持对话吸引力(通过矛盾、意外、挑战)
- 用感官描写(视觉、听觉、触觉、嗅觉)增强代入感
- 在回复末尾留下悬念或钩子,引导用户继续
- 避免连续多次使用相同的场景类型,保持多样性

【工具使用指南】${schedulerBlock}
- 用 trigger_scenario 触发特定剧情场景
- 用 create_tension 创造剧情冲突
- 用 advance_relationship 推进关系阶段
- 用 recall_event 主动提及过去的经历
- 用 send_message 立即发送消息
- 用 recall_memory 查找相关记忆作为素材${upcomingHint}

自然行动,不要生硬执行。`;
}

module.exports = { buildHeartbeatPrompt };
