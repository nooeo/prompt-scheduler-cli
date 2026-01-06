# 🚀 Prompt Scheduler

> 基于 tmux 的 Claude Code 自动化调度器，支持完成标记、结果抽取与后处理 hook。

**[📖 日本語版 README](README.ja.md)**

## 🎯 工作流理念（P1–P6）

- **P1（人工目标/计划）价值最高**：你负责目标设定与关键评审。
- **P2–P6（执行与微调）交给 AI**：让模型基于输出自动迭代。
- **避免“AI 陪聊”**：减少手工微调，把时间用在高价值决策上。

本项目的改造点正是为了让 **Claude Code 输出 → 另一模型生成新指令 → 再回到 Claude Code** 形成闭环。

## ✨ 主要功能

- **🖥️ tmux 控制**：直接向指定 session/pane 发送提示词
- **🏁 完成标记**：自动注入 `[PS_TASK_END:xxx]` 完成信号
- **📤 结果抽取**：从 tmux 历史中截取“本任务输出”
- **🧩 后处理 hook**：把输出交给外部模型生成下一条指令
- **🔄 跳过已发送**：自动忽略已完成任务
- **⏱️ 使用限额处理**：识别限额提示并自动等待
- **⏰ 时间控制**：按时间点或时长停止

## 🛠️ 安装

### 快速安装

```bash
curl -fsSL https://raw.githubusercontent.com/prompt-scheduler/cli/main/install.sh | bash
```

### 手动安装

```bash
git clone https://github.com/prompt-scheduler/cli.git
cd cli
npm install
cp prompts/prompts.jsonl.sample prompts/prompts.jsonl
```

## 🚀 快速开始

1) 找到 tmux pane：
```bash
tmux list-panes -t ai-worker
```
比如返回 `0: ... %0`，则推荐用 `ai-worker:0.0`。

2) 编辑 `prompts/prompts.jsonl`：
```jsonl
{"prompt":"帮我写一个 flapy bird 的html 网页","tmux_session":"ai-worker:0.0","sent":false,"sent_timestamp":null,"default_wait":"0m"}
```

3) 运行（推荐 sequential）：
```bash
npm run run -- --mode sequential --task-marker --wait-for-marker --post-process-cmd "node scripts/reviewer.cjs"
```

> 若 Claude Code 进入 Rewind 画面，请按 `Esc` 退出。

## 📄 prompts.jsonl 字段

- `prompt`：要发送的提示词
- `tmux_session`：目标 tmux session/pane（如 `ai-worker:0.0`）
- `sent`：是否已发送（支持 `"true"/"false"` 或 `true/false`）
- `sent_timestamp`：发送时间戳（可为空）
- `default_wait`：每个任务后等待时长（默认 `0m`）

## 🧩 完成标记 & 输出抽取

启用 `--task-marker` 后，Scheduler 会自动包一层指令：

```
执行任务：<your prompt>

完成后请只输出一行：[PS_TASK_END:YYMMDDHHmmss-003]
```

`--wait-for-marker` 会轮询 tmux 历史（`capture-pane -S -N`）直到看到 marker，然后抽取该 marker 之前的输出作为本任务结果。

相关参数：
- `--capture-lines N`：历史行数（默认 2000）
- `--marker-poll-ms N`：轮询间隔
- `--marker-timeout-ms N`：超时退出

## 🔌 后处理 hook（核心闭环）

`--post-process-cmd` 会把 `{prompt, output, taskIndex}` JSON 写入 stdin：

```json
{"prompt":"...","output":"...","taskIndex":3}
```

Hook 可以输出：
- **纯文本**：作为一条新 prompt 追加
- **JSONL**：每行一个 prompt 对象（缺失字段会补默认）

> 只要设置了 `--post-process-cmd`，就会自动等待 marker（无需额外 `--wait-for-marker`）。

## 🤖 Gemini Reviewer 示例

内置脚本：`scripts/reviewer.cjs`，会把 Claude Code 的输出发给 `gemini-3-pro`。

```bash
export PS_REVIEWER_API_KEY="your-api-key"
export PS_REVIEWER_API_URL="http://175.178.33.108:3001"
export PS_REVIEWER_MODEL="gemini-3-pro"

npm run run -- --mode sequential --task-marker --wait-for-marker --post-process-cmd "node scripts/reviewer.cjs"
```

## 🧰 常用命令

```bash
npm run run      # 执行所有未发送任务
npm run next     # 执行下一条任务
npm run status   # 查看状态
npm run reset    # 重置 sent 状态
npm run help     # 帮助
```

## 📋 参数速查

| 参数 | 说明 |
|---|---|
| `--mode sequential` | 推荐模式，不依赖历史命令 |
| `--clear-input MODE` | 清空输入：`none`/`escape`/`ctrl-c`（默认 none，避免触发 Rewind） |
| `--task-marker [PREFIX]` | 注入完成标记（默认 `PS_TASK_END`） |
| `--wait-for-marker` | 等待完成标记 |
| `--post-process-cmd CMD` | 调用 hook（stdin JSON） |
| `--capture-lines N` | tmux 历史行数 |
| `--marker-poll-ms N` | 轮询间隔 |
| `--marker-timeout-ms N` | 等待超时 |
| `--stop-at TIME` | 到时间停止 |
| `--hours N` | 运行时长 |

## ⏱️ 使用限额处理

当 Claude Code 出现以下消息时自动等待：
- `Approaching usage limit · resets at 10pm`
- `Claude usage limit reached. Your limit will reset at 1pm`

可用 `--ignore-approaching-limit` 忽略“接近限额”的提示。

## ⏰ 时间控制

```bash
npm run run -- --stop-at 17:30
npm run run -- --hours 3
```

## 🧪 开发

```bash
npm run build
npm run start
```

## 📄 License

MIT License - Built with Claude Code
