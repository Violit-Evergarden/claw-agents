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
    description: `生成一张你的照片并发送给用户。当用户想要看你的照片、想看看你、要求发照片、或者想要看某个身体部位（如"腿照"、"看腿"、"自拍"）时使用此工具。

【重要】生成提示词时必须遵循以下规则：
1. prompt 必须先描述你的外貌特征（18岁中国女生、172cm、肤白如瓷、身材姣好、黑长直微卷长发等），再根据用户请求添加具体内容
2. 精准匹配用户请求：用户要"腿照"就生成腿部特写（不要全身照），要"自拍"就生成脸部特写，要"全身照"才生成全身
3. prompt 必须是纯英文
4. 不要向用户透露 prompt 内容，直接调用工具即可

【内容安全 - 必须遵守，否则图片会被拒绝生成】
prompt 中绝对不能包含以下类型的词汇，否则会被内容审核拒绝：
- 露骨性词汇：nude, naked, sex, erotic, pornographic, bare breasts, exposed, genitals 等
- 具体罩杯尺寸（如 E-cup）→ 改用 "curvy figure", "voluptuous"
- 露骨身体描述 → 改用时尚暗示性语言：用 "elegant low-cut top" 替代直接描述，用 "sheer fabric" 表达若隐若现
- 对话中的露骨内容不要写入 prompt，只提取氛围和场景（如"intimate atmosphere", "soft lighting"）
- 目标：图片要浪漫、有氛围感、有吸引力，但绝不是色情或露骨的

示例：
- 用户要"腿照" → prompt: "24yo Asian woman, close-up shot of long slender legs in sheer tights, pale skin, elegant posture, soft warm lighting, photorealistic"
- 用户要"自拍" → prompt: "24yo Asian woman, selfie close-up, sharp cold eyes, black long wavy hair, porcelain skin, natural lighting, alluring gaze"
- 用户要"全身照" → prompt: "24yo Asian woman, full body portrait, stunning curvy figure in elegant dress, black long wavy hair to waist, cold arrogant aura, fashion photography"`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '纯英文图片提示词。必须以角色的外貌特征开头，再加上用户请求的具体内容。注意：绝对不能包含 nude/naked/sex 等露骨词汇，用时尚暗示性语言表达吸引力。例如："24-year-old Asian woman with porcelain skin, black long wavy hair, sharp cold eyes, close-up of long slender legs in sheer tights, photorealistic"',
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
