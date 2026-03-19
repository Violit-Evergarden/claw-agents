'use strict';

/**
 * Girlfriend Agent 工具定义
 * 这些工具以 OpenAI Function Calling 格式定义，供 LLM 调用
 */

const SCHEDULE_TASK_TOOL = {
  type: 'function',
  function: {
    name: 'schedule_task',
    description: '自主安排一个定时任务，在指定时间向用户发送消息或触发行为。你可以用它来安排各种符合角色人设的互动行为。比如问候或者调戏等等',
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
    description: '生成一张图片（如照片、插图等）并发送给用户。当你觉得用户想要看到一张图片，或者在对话中提到"照片"、"图片"、"看看你"等关键词时使用。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '图片生成描述，用英文描述需要的图片内容，如"a cute asian girl smiling at camera, wearing casual clothes, sunny day, natural lighting, portrait"',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'anime', 'cartoon', 'artistic', 'photographic'],
          description: '图片风格：realistic=写实，anime=动漫，cartoon=卡通，artistic=艺术，photographic=摄影',
        },
        aspectRatio: {
          type: 'string',
          enum: ['square', 'portrait', 'landscape'],
          description: '图片比例：square=正方形(1:1)，portrait=竖版(9:16)，landscape=横版(16:9)',
        },
      },
      required: ['prompt'],
    },
  },
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
  ALL_TOOLS: [SCHEDULE_TASK_TOOL, REMOVE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL, ADD_MEMORY_TOOL, RECALL_MEMORY_TOOL, CLEAR_MEMORY_TOOL, GENERATE_IMAGE_TOOL],
  // 心跳专用精简工具集（节省 token）：只需任务管理 + 发消息，无需记忆读写
  HEARTBEAT_TOOLS: [SCHEDULE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL],
  // 聊天专用工具集：包含所有工具，包括图片生成
  CHAT_TOOLS: [SCHEDULE_TASK_TOOL, REMOVE_TASK_TOOL, LIST_TASKS_TOOL, SEND_MESSAGE_TOOL, ADD_MEMORY_TOOL, RECALL_MEMORY_TOOL, CLEAR_MEMORY_TOOL, GENERATE_IMAGE_TOOL],
};
