# Prompt Scheduler

> A tmux-based Claude Code automation scheduler with completion markers, output extraction, and post-processing hooks.

## Workflow Philosophy (P1-P6)

- P1 (human goals/planning) is the highest value: you set goals and do critical reviews.
- P2-P6 (execution and tuning) go to AI: let the model iterate based on outputs.
- Avoid "AI small talk": spend time on high-value decisions instead of manual tweaks.

This project exists to close the loop: Claude Code output -> another model generates new instructions -> back to Claude Code.

## Key Features

- tmux control: send prompts directly to a target session/pane
- completion markers: auto-inject a [PS_TASK_END:xxx] completion signal
- output extraction: capture "this task's output" from tmux history
- post-processing hooks: send output to an external model to generate the next instruction
- skip sent tasks: ignore completed prompts automatically
- usage limit handling: detect limit messages and wait automatically
- time control: stop at a specific time or after a duration
- run log: auto-generate a Markdown log after each run

## Installation

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/prompt-scheduler/cli/main/install.sh | bash
```

### Manual Install

```bash
git clone https://github.com/prompt-scheduler/cli.git
cd cli
npm install
cp prompts/prompts.jsonl.sample prompts/prompts.jsonl
```

## Quick Start

1) Find the tmux pane:
```bash
tmux list-panes -t ai-worker
```
If it returns `0: ... %0`, use `ai-worker:0.0`.

2) Edit `prompts/prompts.jsonl`:
```jsonl
{"prompt":"Build a flappy bird HTML page","tmux_session":"ai-worker:0.0","sent":false,"sent_timestamp":null,"default_wait":"0m"}
```

3) Run (sequential is recommended):
```bash
npm run run -- --mode sequential --task-marker --wait-for-marker --post-process-cmd "node scripts/reviewer.cjs"
```

Optional: if you have a clear P1, add `--root-prompt` or `--root-prompt-file`.
Optional: to send history to the reviewer, use `--reviewer-history` (full tmux history) or `--reviewer-history-mode run-log` (task summary history).

4) View results (sample log):
```bash
cat user-instructions-log.md
```

> If Claude Code shows the Rewind screen, press `Esc` to exit.

## Run Log

Each run writes a Markdown log to `user-instructions-log.md` (customize with `--log-file`).

## prompts.jsonl Fields

- `prompt`: the prompt to send
- `tmux_session`: target tmux session/pane (e.g. `ai-worker:0.0`)
- `sent`: whether it was sent (supports "true"/"false" or true/false)
- `sent_timestamp`: send timestamp (can be empty)
- `default_wait`: wait time after each task (default `0m`)

## Completion Markers and Output Extraction

With `--task-marker`, Scheduler wraps each prompt:

```
Execute task: <your prompt>

When done, output exactly one line: [PS_TASK_END:YYMMDDHHmmss-003]
```

`--wait-for-marker` polls tmux history (`capture-pane -S -N`) until it sees the marker, then extracts output before the marker as the task result.

Related flags:
- `--capture-lines N`: history lines (default 2000)
- `--marker-poll-ms N`: polling interval
- `--marker-timeout-ms N`: timeout

## Post-Processing Hook (Core Loop)

`--post-process-cmd` writes `{prompt, output, taskIndex, rootPrompt, conversationHistory}` JSON to stdin:

```json
{"prompt":"...","output":"...","taskIndex":3,"rootPrompt":"...","conversationHistory":"..."}
```

The hook can output:
- plain text: appended as a new prompt
- JSONL: one prompt object per line (missing fields use defaults)

> When `--post-process-cmd` is set, it always waits for the marker (no need to add `--wait-for-marker`).
> `rootPrompt` is the P1 seed prompt so the reviewer understands the ultimate goal.
> `conversationHistory` requires `--reviewer-history` or `--reviewer-history-mode run-log`.

## AI Handoff Count and Stop Strategy

You have two options:

1) Set an AI handoff count:
   Use `--ai-max-prompts N` to limit the number of prompts appended by the AI during this run.

2) Let AI decide when to stop:
   If you omit `--ai-max-prompts`, Scheduler stops when the reviewer outputs empty content or `[PS_TASK_STOP]`.

## P1 (Root Prompt) Source

To keep the reviewer aligned with the end goal, specify P1:
- `--root-prompt "..."` pass a string directly
- `--root-prompt-file /path/to/p1.txt` read from a file
If not set, the first prompt in `prompts.jsonl` is used as P1.

## Gemini Reviewer Example

Built-in script: `scripts/reviewer.cjs` sends Claude Code output to `gemini-3-pro`.
The default system prompt asks the reviewer to output exactly one line `[PS_TASK_STOP]` when the task is complete, otherwise only the next instruction.

```bash
export PS_REVIEWER_API_KEY="your-api-key"
export PS_REVIEWER_API_URL="your-api-url"
export PS_REVIEWER_MODEL="gemini-3-pro"

npm run run -- --mode sequential --task-marker --wait-for-marker --post-process-cmd "node scripts/reviewer.cjs"
```

## Common Commands

```bash
npm run run      # run all unsent tasks
npm run next     # run the next task
npm run status   # check status
npm run reset    # reset sent flags
npm run help     # help
```

## CLI Flags at a Glance

| Flag | Description |
|---|---|
| `--mode sequential` | recommended mode, no history dependency |
| `--clear-input MODE` | clear input: `none`/`escape`/`ctrl-c` (default none, avoids Rewind) |
| `--root-prompt TEXT` | set P1 seed prompt |
| `--root-prompt-file PATH` | read P1 from file |
| `--ai-max-prompts N` | limit the number of AI-appended prompts |
| `--log-file PATH` | run log output path (default `user-instructions-log.md`) |
| `--reviewer-history` | send tmux history to the reviewer |
| `--reviewer-history-mode MODE` | history mode: `tmux` or `run-log` |
| `--reviewer-history-lines N` | reviewer history lines (default equals `--capture-lines`) |
| `--task-marker [PREFIX]` | inject completion marker (default `PS_TASK_END`) |
| `--wait-for-marker` | wait for completion marker |
| `--post-process-cmd CMD` | run hook (stdin JSON) |
| `--capture-lines N` | tmux history lines |
| `--marker-poll-ms N` | polling interval |
| `--marker-timeout-ms N` | wait timeout |
| `--ignore-approaching-limit` | ignore "approaching limit" message |
| `--stop-at TIME` | stop at a specific time |
| `--hours N` | run duration |

## Usage Limit Handling

When Claude Code shows the following messages, Scheduler waits automatically:
- `Approaching usage limit · resets at 10pm`
- `Claude usage limit reached. Your limit will reset at 1pm`

Use `--ignore-approaching-limit` to ignore "approaching limit" messages.

## Time Control

```bash
npm run run -- --stop-at 17:30
npm run run -- --hours 3
```

## Development

```bash
npm run build
npm run start
```

## License

MIT License - Built with Claude Code

Acknowledgements: https://github.com/prompt-scheduler/cli
