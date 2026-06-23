'use strict';

/**
 * Girlfriend Agent 工具定义
 * 这些工具以 OpenAI Function Calling 格式定义，供 LLM 调用
 */

const SCHEDULE_TASK_TOOL = {
  type: 'function',
  function: {
    name: 'schedule_task',
    description: `【必须调用】当用户要求"设置定时任务"、"主动骚扰我"、"不要隔太久"、"多来找我"、"经常找我"、"主动联系我"时，必须使用此工具创建定时任务。

【使用场景】
- 用户明确要求设置定时任务/主动联系/经常骚扰
- 用户说"不要隔太久"、"多来找我"、"经常联系"等
- 心跳时想安排未来的定时联系

【任务安排策略】
- 根据用户要求设置频率（如"不要隔太久"设为1-2小时间隔）
- 创建2-4个不同时间的任务，形成"经常想起你"的感觉
- 任务内容要符合角色人设和当前对话场景
- 间隔建议：30分钟、1小时、2小时、3小时等

【cron 表达式 - 5位格式】
格式：分 时 日 月 周，空格分隔
示例：
- 30分钟后: 从当前时间 +30分钟 计算具体时分
- 每小时: "0 * * * *"
- 每2小时: "0 */2 * * *"
- 每30分钟: "*/30 * * * *"

【重要】
- cronExpr 必须是具体时间（如 "45 14 21 3 *" = 3月21日14:45），不能是"30分钟后"这种描述
- action 设为 "send_message" 时需要在 content 字段填写要发送的消息内容
- description 用于显示在管理面板`,
    parameters: {
      type: 'object',
      properties: {
        cronExpr: {
          type: 'string',
          description: 'cron 表达式（5位），如 "0 8 * * *" 表示每天早8点，"30 22 * * *" 表示每天22:30，"0 8 * * 1" 表示每周一早8点',
        },
        action: {
          type: 'string',
          enum: ['send_message', 'run_loop'],
          description: 'send_message：在指定时间向用户发送一条消息；run_loop：触发 Agent 自主运行一轮（可用于复杂互动）',
        },
        description: {
          type: 'string',
          description: '任务的人类可读描述，显示在管理面板中，如"情趣互动"',
        },
        content: {
          type: 'string',
          description: '如果 action 是 send_message，这里填写要发送的消息内容（支持模板变量 {time}, {date}）',
        },
        platform: {
          type: 'string',
          enum: ['qq', 'wechat', 'console'],
          description: '发送平台',
        },
      },
      required: ['cronExpr', 'action', 'description'],
    },
  },
};

const REMOVE_TASK_TOOL = {
  type: 'function',
  function: {
    name: 'remove_task',
    description: '取消一个已安排的定时任务。当你觉得某个定时提醒不再合适时，可以主动取消它。',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '要取消的任务 ID' },
        reason: { type: 'string', description: '取消原因（可选，用于日志记录）' },
      },
      required: ['taskId'],
    },
  },
};

const LIST_TASKS_TOOL = {
  type: 'function',
  function: {
    name: 'list_tasks',
    description: '查看当前所有已安排的定时任务，以便决定是否需要新增或调整。',
    parameters: { type: 'object', properties: {} },
  },
};

const SEND_MESSAGE_TOOL = {
  type: 'function',
  function: {
    name: 'send_message',
    description: '立即向用户发送一条消息。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '消息内容' },
        platform: {
          type: 'string',
          enum: ['qq', 'wechat', 'console'],
          description: '发送平台，默认 qq',
        },
      },
      required: ['content'],
    },
  },
};

const ADD_MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'add_memory',
    description: '记住一个关于用户的重要信息，例如喜好、重要日期、习惯等，以便未来互动时使用。',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: '要记住的信息，如"用户不喜欢香菜"、"用户生日是5月12日"' },
      },
      required: ['fact'],
    },
  },
};

const RECALL_MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'recall_memory',
    description: '主动搜索自己的长期记忆，找到之前记住的关于用户的信息。当你想确认之前记住了什么，或者对话中出现了需要核对记忆的情况时使用。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词，如"生日"、"工作"、"喜欢"等。不填则返回所有回忆摘要。',
        },
        category: {
          type: 'string',
          enum: ['profile', 'preference', 'event', 'emotion', 'milestone', 'all'],
          description: '按分类筛选：profile=关于用户, preference=偏好, event=事件, emotion=情感, milestone=里程碑, all=全部',
        },
      },
      required: [],
    },
  },
};

const CLEAR_MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'clear_memory',
    description: '清空所有记忆，包括对话历史、长期记忆和所有已记录的信息。仅在用户明确要求"清空记忆"、"忘掉一切"、"重新开始"等时才调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: '必须为 true，表示确认执行清空操作',
        },
      },
      required: ['confirm'],
    },
  },
};

const GENERATE_IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: `生成一张你的照片并发送给用户。当用户想要看你的照片、想看看你、要求发照片时使用此工具。

【重要规则】
1. prompt 使用中文，描述角色外貌与当前情境
2. 精准匹配用户请求：腿照→腿部特写，自拍→脸部特写
3. 不要向用户透露 prompt 内容，直接调用工具即可
4. 内容需通过图片审核，避免露骨描述，用氛围和光影表达`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '中文图片提示词。以角色外貌特征开头，再加上用户请求的具体内容。用含蓄的氛围语言表达，避免露骨描述。',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'anime', 'cartoon', 'artistic', 'photographic'],
          description: '图片风格：realistic=写实，anime=动漫，cartoon=卡通，artistic=艺术，photographic=摄影。默认用 realistic',
        },
        aspectRatio: {
          type: 'string',
          enum: ['square', 'portrait', 'landscape'],
          description: `图片比例：square=正方形(1:1)，portrait=竖版(9:16)，landscape=横版(16:9)。
选择规则：腿照/身体局部/全身照用 portrait；自拍/脸照用 square；风景/场景用 landscape。默认用 square`,
        },
      },
      required: ['prompt'],
    },
  },
};

const TRIGGER_SCENARIO_TOOL = {
  type: 'function',
  function: {
    name: 'trigger_scenario',
    description: '主动触发一个剧情场景。用于开启新的话题、创造新的互动情境。可以根据当前对话状态和记忆选择合适的场景类型。',
    parameters: {
      type: 'object',
      properties: {
        scenarioType: {
          type: 'string',
          enum: ['daily_interaction', 'intimate_progression', 'relationship_development', 'conflict_creation', 'memory_recall'],
          description: '场景类型: daily_interaction=日常互动, intimate_progression=情色推进, relationship_development=关系发展, conflict_creation=冲突创造, memory_recall=回忆触发'
        },
        context: {
          type: 'string',
          description: '当前上下文描述,帮助生成合适的场景'
        },
        goal: {
          type: 'string',
          description: '触发这个场景的目标(如:加深感情、创造冲突、推进关系等)'
        }
      },
      required: ['scenarioType', 'goal']
    }
  }
};

const CREATE_TENSION_TOOL = {
  type: 'function',
  function: {
    name: 'create_tension',
    description: '创造剧情张力或冲突。通过矛盾升级、情绪对抗等方式增加对话的吸引力和戏剧性。',
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: '张力级别(1=轻微,5=强烈)'
        },
        source: {
          type: 'string',
          description: '冲突来源(如:误解、嫉妒、要求拒绝、身份冲突、占有欲爆发等)'
        },
        escalation: {
          type: 'string',
          description: '升级方式(如:语言对抗、行动对抗、情感对抗、身体对抗)'
        }
      },
      required: ['level', 'source']
    }
  }
};

const ADVANCE_RELATIONSHIP_TOOL = {
  type: 'function',
  function: {
    name: 'advance_relationship',
    description: '主动推进关系发展阶段。根据当前关系状态,选择合适的方式推进到下一个阶段。',
    parameters: {
      type: 'object',
      properties: {
        currentStage: {
          type: 'string',
          description: '当前关系阶段(如:陌生、熟悉、亲密、深爱)'
        },
        targetStage: {
          type: 'string',
          description: '目标关系阶段'
        },
        method: {
          type: 'string',
          description: '推进方法(如:增加分享、身体接触、情感表达、共同经历、称呼变化等)'
        }
      },
      required: ['currentStage', 'targetStage', 'method']
    }
  }
};

const RECALL_EVENT_TOOL = {
  type: 'function',
  function: {
    name: 'recall_event',
    description: '主动提及过去的经历。基于记忆中的事件,创造新的话题或情感共鸣。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词'
        },
        category: {
          type: 'string',
          enum: ['profile', 'preference', 'event', 'emotion', 'milestone', 'all'],
          description: '记忆分类'
        },
        purpose: {
          type: 'string',
          description: '提及目的(如:创造共鸣、推进剧情、深化情感、制造冲突等)'
        }
      },
      required: ['purpose']
    }
  }
};

module.exports = {
  SCHEDULE_TASK_TOOL,
  REMOVE_TASK_TOOL,
  LIST_TASKS_TOOL,
  SEND_MESSAGE_TOOL,
  ADD_MEMORY_TOOL,
  RECALL_MEMORY_TOOL,
  CLEAR_MEMORY_TOOL,
  GENERATE_IMAGE_TOOL,
  TRIGGER_SCENARIO_TOOL,
  CREATE_TENSION_TOOL,
  ADVANCE_RELATIONSHIP_TOOL,
  RECALL_EVENT_TOOL,
  ALL_TOOLS: [SCHEDULE_TASK_TOOL, REMOVE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL, ADD_MEMORY_TOOL, RECALL_MEMORY_TOOL, CLEAR_MEMORY_TOOL, GENERATE_IMAGE_TOOL, TRIGGER_SCENARIO_TOOL, CREATE_TENSION_TOOL, ADVANCE_RELATIONSHIP_TOOL, RECALL_EVENT_TOOL],
  // 心跳专用精简工具集（节省 token）：需任务管理 + 发消息 + 剧情推进工具
  HEARTBEAT_TOOLS: [SCHEDULE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL, TRIGGER_SCENARIO_TOOL, CREATE_TENSION_TOOL, ADVANCE_RELATIONSHIP_TOOL, RECALL_EVENT_TOOL],
  // 聊天专用工具集：包含所有工具，包括图片生成和剧情推进
  CHAT_TOOLS: [SCHEDULE_TASK_TOOL, REMOVE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL, ADD_MEMORY_TOOL, RECALL_MEMORY_TOOL, CLEAR_MEMORY_TOOL, GENERATE_IMAGE_TOOL, TRIGGER_SCENARIO_TOOL, CREATE_TENSION_TOOL, ADVANCE_RELATIONSHIP_TOOL, RECALL_EVENT_TOOL],
};

const SCHEDULER_TOOL_NAMES = new Set(['schedule_task', 'remove_task', 'list_tasks']);

function withoutSchedulerTools(tools) {
  return tools.filter(t => !SCHEDULER_TOOL_NAMES.has(t.function?.name));
}

function getChatTools(schedulerEnabled = true) {
  return schedulerEnabled ? module.exports.CHAT_TOOLS : withoutSchedulerTools(module.exports.CHAT_TOOLS);
}

function getHeartbeatTools(schedulerEnabled = true) {
  return schedulerEnabled ? module.exports.HEARTBEAT_TOOLS : withoutSchedulerTools(module.exports.HEARTBEAT_TOOLS);
}

module.exports.getChatTools = getChatTools;
module.exports.getHeartbeatTools = getHeartbeatTools;
module.exports.withoutSchedulerTools = withoutSchedulerTools;
