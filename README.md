# Claw Agents

多 Agent 系统，支持 AI 女友 Violet（自主定时任务）+ 工作助理，接入 QQ/微信，提供可视化管理面板。

---

## 快速启动

### 1. 配置

```bat
copy config.example.json config.json
copy .env.example .env
```

编辑 `.env`，填入 API Key 和 QQ Bot Secret（**密钥只放环境变量，不要写入 config.json**）：

```env
LLM_API_KEY_GROK=xai-xxxxxxxx
LLM_API_KEY_DEEPSEEK=sk-xxxxxxxx
QQ_APP_SECRET_0=your-qq-app-secret
```

`config.json` 仅保留模型、端口、Bot 列表等非敏感配置。完整变量说明见 `.env.example`。

> 支持任意 OpenAI 兼容 API，在 `config.json` 的 `providers` 中配置 baseURL 和模型列表即可。

### 2. 启动系统

```bat
start.bat
```

访问面板：http://localhost:3000

---

## QQ Bot 配置（双向收发消息）

### 前置条件

你已有 QQ 开放平台账号。AppSecret 通过环境变量 `QQ_APP_SECRET_0`（或 `QQ_APP_SECRET_{agentId}`）配置，AppId 写在 `config.json` 的 `bots[]` 中。

### 步骤一：配置 Webhook 回调地址

1. 登录 [QQ 开放平台](https://q.qq.com/)
2. 进入你的机器人管理 → **开发设置** → **消息推送**
3. 填写 Webhook URL：`http://你的公网IP:3000/webhook/qq`
4. 点击验证，系统会自动处理验证请求（代码已实现 op=13 回包）

> **本地开发时**：需要使用 ngrok 或内网穿透将本地 3000 端口暴露到公网：
> ```
> ngrok http 3000
> ```
> 然后填写 ngrok 给你的 https URL + /webhook/qq

### 步骤二：订阅事件

在 QQ 开放平台事件订阅中勾选：
- `C2C_MESSAGE_CREATE`（私聊消息）
- `FRIEND_ADD`（好友添加）
- `GROUP_AT_MESSAGE_CREATE`（群 @ 消息，可选）

### 步骤三：设置 Violet 的推送目标

首次有用户向机器人发消息时，系统会自动记录该用户的 openid。
之后 Violet 的主动推送就会发给这个用户。

或者手动设置环境变量：
```
set QQ_TARGET_OPENID=你的openid
start.bat
```

---

## 微信配置（企业微信机器人）

1. 在企业微信群中，点击右上角 **添加机器人**
2. 创建后复制 Webhook URL
3. 填入 `config.json`：
```json
{
  "wechat": {
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
    "enabled": true
  }
}
```

> 企业微信群机器人只支持**发送**，不支持接收私聊。适合 Violet 主动推送通知。

---

## 系统架构

```
src/
├── core/
│   ├── agent-manager.js      # Agent 生命周期、心跳调度
│   ├── agent-loop.js         # LLM 调用 + Tool Call 循环
│   ├── tool-runner.js        # Tool 执行与 JSON 解析容错
│   ├── llm-client.js         # OpenAI SDK 封装（含重试）
│   ├── memory-store.js       # 对话记忆持久化
│   ├── character-store.js    # 多角色人设管理
│   ├── story-state-store.js  # 剧情状态（关系阶段、张力）
│   ├── reply-dispatcher.js   # 统一消息/图片回复
│   └── config-loader.js      # 配置加载 + 环境变量覆盖
├── agents/
│   ├── registry.js           # Agent 类型注册表
│   ├── girlfriend/           # AI 女友 Agent（多 Bot 多角色）
│   │   ├── config.js         # 工厂函数
│   │   ├── run-turn.js       # Turn 编排
│   │   ├── tool-executors.js # 工具执行器
│   │   ├── image-pipeline.js # 统一图片流水线
│   │   └── ...
│   └── assistant/            # 工作助理 Agent
├── scheduler/                # 定时任务引擎
├── adapters/                 # QQ / 微信消息适配
├── server/                   # Express + SSE + REST API
└── main.js                   # 系统入口

dashboard/                    # React 管理面板
data/
  ├── characters/             # 角色定义（含 imageBasePrompt）
  ├── memory/                 # 按 characterId 隔离的记忆
  ├── story/                  # 剧情状态
  └── tasks.json              # 定时任务
config.example.json           # 非敏感配置模板（复制为 config.json）
.env.example                  # 密钥环境变量模板（复制为 .env）
config.json                   # 本地运行时配置（gitignore，不含密钥）
.env                          # 本地密钥（gitignore）
```

### 多 Bot 配置

`config.json` 中 `bots[]` 支持可选 `type` 字段（默认 `girlfriend`）：

```json
{
  "bots": [
    { "agentId": "violet", "characterId": "shuangqing", "type": "girlfriend" }
  ]
}
```

### 开发命令

```bat
npm run dev          # 热重载启动
npm test             # 运行单元测试
npm run validate     # 校验配置与依赖
npm run reset-data   # 清空 memory/story/personas（保留 characters）
```

---

## Violet 自主调度机制

Violet 拥有以下工具：

| 工具 | 用途 |
|------|------|
| `schedule_task` | 自主安排定时任务（cron 表达式） |
| `remove_task` | 取消不再需要的任务 |
| `list_tasks` | 查看当前任务列表 |
| `send_message` | 立即发送消息 |
| `add_memory` | 记住关于用户的信息 |

每隔 5 分钟，Violet 会触发一次心跳，自己评估：
- 现在几点了？有什么该说的？
- 已有的定时任务是否需要调整？
- 是否需要新增一个提醒？

---

## 面板截图

- **Agent 总览页**：实时状态、手动触发、发消息给 Agent、实时日志流
- **定时任务页**：查看所有任务（含 Violet 自主添加的）、暂停/恢复/删除/立即触发、新增手动任务

---

## 常见问题

**Q: LLM 调用失败**  
A: 检查 `.env` 或云服务器环境变量中的 `LLM_API_KEY_*` 是否正确，以及 `config.json` 中 baseURL 是否匹配。

---

## 云服务器部署

1. 克隆仓库，安装依赖：`npm install && cd dashboard && npm install && npm run build && cd ..`
2. 复制配置：`cp config.example.json config.json`
3. 在云平台（或 systemd / Docker）注入环境变量，参考 `.env.example`：
   - `LLM_API_KEY_GROK` / `LLM_API_KEY_DEEPSEEK` 等
   - `QQ_APP_SECRET_0` 等
   - 可选 `SCHEDULER_ENABLED=0` 禁用定时任务
4. 启动：`npm start`（默认端口 3000，可在 config.json 修改）
5. 确保 Webhook 端口对公网可访问，或将反向代理指向 `/webhook/qq/0`

**Q: QQ 消息收不到**  
A: 确认 Webhook URL 已配置，且端口 3000 对外可访问（或用 ngrok）。

**Q: Violet 一直没有主动发消息**  
A: 心跳间隔默认 5 分钟，第一次心跳时 Violet 会评估要不要发。可以在面板手动触发一次看日志。

**Q: 任务重启后消失**  
A: 不会。所有任务持久化在 `data/tasks.json`，重启时自动恢复。
