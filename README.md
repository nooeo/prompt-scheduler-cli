**Prompt Scheduler Loop Agent** 是对 Prompt Scheduler 的闭环增强：它可以把任务发送给 tmux 中运行的 Claude Code，等待可判定的完成信号（Done Marker），抽取该轮输出结果，然后调用一个可插拔的“评审/规划”大模型（通过外部 hook 命令）生成下一步处理意见，并自动回写给 Claude Code，形成 P2–P6 的自迭代工作流。

**核心特性：**

- 结果驱动的完成判定（marker），替代盲等
- 从 tmux 历史中抽取本轮输出并落盘可追溯
- 外部 hook 接入任意大模型/规则引擎（供应商无关）
- 超时/轮数/错误护栏，避免无限循环与成本失控

English README: [README.en.md](README.en.md)

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
- **📝 复盘日志**：运行结束自动生成 Markdown 记录

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
{"prompt":"帮我写一个 flappy bird 的html 网页","tmux_session":"ai-worker:0.0","sent":false,"sent_timestamp":null,"default_wait":"0m"}
```

3) 运行（推荐 sequential）：
```bash
npm run run -- --mode sequential --task-marker --wait-for-marker --post-process-cmd "node scripts/reviewer.cjs"
```

可选：如果有明确的 P1，可加上 `--root-prompt` 或 `--root-prompt-file`。  
可选：如需把历史上下文发给 reviewer，可用 `--reviewer-history`（tmux 全部历史）或 `--reviewer-history-mode run-log`（任务摘要历史）。

4) 查看效果（示例日志）：
```bash
cat user-instructions-log.md
```

> 若 Claude Code 进入 Rewind 画面，请按 `Esc` 退出。

## 📝 复盘日志

每次执行结束后都会把本次互动过程写入 `user-instructions-log.md`（可用 `--log-file` 指定路径）。

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

`--post-process-cmd` 会把 `{prompt, output, taskIndex, rootPrompt, conversationHistory}` JSON 写入 stdin：

```json
{"prompt":"...","output":"...","taskIndex":3,"rootPrompt":"...","conversationHistory":"..."}
```

Hook 可以输出：
- **纯文本**：作为一条新 prompt 追加
- **JSONL**：每行一个 prompt 对象（缺失字段会补默认）

> 只要设置了 `--post-process-cmd`，就会自动等待 marker（无需额外 `--wait-for-marker`）。
> `rootPrompt` 为 P1“创世提示词”，用于让 reviewer 理解终极目标背景。  
> `conversationHistory` 需要开启 `--reviewer-history` 或 `--reviewer-history-mode run-log`。

## 🔁 AI 接替次数与停止策略

你有两种选择：

1) **设定 AI 接替次数**：  
   使用 `--ai-max-prompts N` 限制后续由 AI 追加的 prompt 数量（仅统计本次运行追加的数量）。

2) **让 AI 自行决定停止**：  
   不设置 `--ai-max-prompts`，当 reviewer 输出空内容或 `[PS_TASK_STOP]` 时，Scheduler 不再追加新任务。

## 🧭 P1（创世提示词）来源

为了让 reviewer 始终理解终极目标，可指定 P1：  
- `--root-prompt "..."` 直接传字符串  
- `--root-prompt-file /path/to/p1.txt` 从文件读取  
未指定时默认使用 `prompts.jsonl` 的第一条 prompt 作为 P1。

## 🤖 Gemini Reviewer 示例

内置脚本：`scripts/reviewer.cjs`，会把 Claude Code 的输出发给 `gemini-3-pro`。
默认 system prompt 会要求 reviewer 在任务完成时只输出一行 `[PS_TASK_STOP]`，否则只返回下一条指令。

```bash
export PS_REVIEWER_API_KEY="your-api-key"
export PS_REVIEWER_API_URL="your-api-url"
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
| `--root-prompt TEXT` | 指定 P1 创世提示词 |
| `--root-prompt-file PATH` | 从文件读取 P1 |
| `--ai-max-prompts N` | 限制 AI 追加的 prompt 数量 |
| `--log-file PATH` | 复盘日志输出路径（默认 `user-instructions-log.md`） |
| `--reviewer-history` | 把 tmux 历史记录发送给 reviewer |
| `--reviewer-history-mode MODE` | 历史模式：`tmux` 或 `run-log` |
| `--reviewer-history-lines N` | reviewer 历史行数（默认等于 `--capture-lines`） |
| `--task-marker [PREFIX]` | 注入完成标记（默认 `PS_TASK_END`） |
| `--wait-for-marker` | 等待完成标记 |
| `--post-process-cmd CMD` | 调用 hook（stdin JSON） |
| `--capture-lines N` | tmux 历史行数 |
| `--marker-poll-ms N` | 轮询间隔 |
| `--marker-timeout-ms N` | 等待超时 |
| `--ignore-approaching-limit` | 忽略“接近限额”提示 |
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

致谢：https://github.com/prompt-scheduler/cli
