# Claw Agents

多 Agent 系统，支持 AI 女友 Violet（自主定时任务）+ 工作助理，接入 QQ/微信，提供可视化管理面板。

---

## 快速启动

### 1. 配置 LLM API Key

编辑 `config.json`，填写你的 LLM API Key：

```json
{
  "llm": {
    "apiKey": "sk-xxxxxxxxxxxx",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4o"
  }
}
```

> 支持任意 OpenAI 兼容 API，例如：
> - OpenAI: `https://api.openai.com/v1`
> - 国内代理/中转：替换 baseURL 即可
> - 硅基流动、DeepSeek、智谱等兼容接口

### 2. 启动系统

```bat
start.bat
```

访问面板：http://localhost:3000

---

## QQ Bot 配置（双向收发消息）

### 前置条件

你已有 QQ 开放平台账号，AppID = `1903486211`，AppSecret 已配置在 config.json。

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
│   ├── agent-manager.js    # Agent 生命周期管理
│   ├── agent-loop.js       # LLM 调用 + Tool Call 执行
│   ├── llm-client.js       # OpenAI SDK 封装
│   └── memory-store.js     # 对话记忆持久化
├── scheduler/
│   ├── cron-manager.js     # 定时任务引擎
│   └── task-store.js       # 任务持久化
├── adapters/
│   ├── qq-adapter.js       # QQ Bot API 封装
│   ├── wechat-adapter.js   # 企业微信 Webhook
│   └── message-router.js   # 统一消息路由
├── agents/
│   ├── violet/             # AI 女友 Agent
│   └── assistant/          # 工作助理 Agent
├── server/                 # Express + SSE + REST API
└── main.js                 # 系统入口

dashboard/                  # React 前端面板（已构建到 dist/）
data/                       # 持久化数据
  ├── tasks.json            # 定时任务列表
  └── memory/               # Agent 对话记忆
config.json                 # 全局配置（含 API Key，不提交 git）
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
A: 检查 config.json 中的 apiKey 和 baseURL 是否正确。

**Q: QQ 消息收不到**  
A: 确认 Webhook URL 已配置，且端口 3000 对外可访问（或用 ngrok）。

**Q: Violet 一直没有主动发消息**  
A: 心跳间隔默认 5 分钟，第一次心跳时 Violet 会评估要不要发。可以在面板手动触发一次看日志。

**Q: 任务重启后消失**  
A: 不会。所有任务持久化在 `data/tasks.json`，重启时自动恢复。
