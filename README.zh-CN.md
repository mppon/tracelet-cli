<!-- 本文件提供 Tracelet 的中文项目说明、启动方式、数据格式与开发指南。 -->

# Tracelet

Tracelet 是一个面向 Claude Code 和 Codex 的本地流量记录工具。

[English](./README.md)

## 项目简介

Tracelet 是一个使用 TypeScript 编写的本地命令行工具。它启动本地 HTTP 代理，将 Claude Code 或 Codex 本次运行的 Base URL 临时指向代理，记录 Agent 发给 LLM 的请求、上游响应以及代理实际观察到的每个流式 chunk。

Tracelet 不修改请求 body。代理只完成请求转发、必要的代理路径移除和 HTTP 逐跳 Header 处理，同时把流量副本保存在本地。

## 当前功能

- 基于 Commander 的 CLI，无参数运行时可选择 Claude Code 或 Codex。
- 提供系统代理 On/Off 配置，支持读取 macOS 和 Windows 的固定系统代理。
- 仅对当前 Agent 子进程覆盖 Base URL，不修改用户的全局配置。
- 原样保存请求 body 和响应 body。
- 对 Codex 的 `Content-Encoding: zstd` 请求副本进行只读解码，用于解析和展示。
- 记录每个请求、响应网络 chunk 的序号、到达时间、偏移和长度。
- 增量解析跨 chunk 的 SSE 事件。
- 使用官方 SDK 还原完整流式响应：
  - Anthropic：`MessageStream.fromReadableStream(...).finalMessage()`
  - OpenAI：`ResponseStream.fromReadableStream(...).finalResponse()`
- 按 Claude Session Header、OpenAI Conversation 或 Response Chain 识别会话。
- 提供本地 Dashboard，查看完整请求、完整响应和 SSE 事件。
- Dashboard 支持中英文切换、浏览器语言识别和语言选择持久化。
- 保存前自动脱敏 Authorization、API Key 和 Cookie 等敏感 Header。
- 使用原始二进制文件和 JSONL 存储，不依赖数据库。

> Tracelet chunk 来自 Node.js Stream `data` 事件，不保证等同于底层单个 TCP 数据包或一条 SSE 事件。

## 环境要求

- Node.js 22 或更高版本
- pnpm 11
- 已安装并登录 `claude` 或 `codex`

## 安装与构建

```bash
pnpm install
pnpm build
```

构建完成后可以直接运行：

```bash
node apps/cli/dist/bin.js
```

如果希望在本机直接使用 `tracelet` 命令，可以建立开发链接：

```bash
cd apps/cli
npm link
tracelet
```

## 启动方式

不带子命令启动时，Tracelet 会显示 Claude Code 和 Codex 选择菜单：

```bash
tracelet
```

直接启动 Claude Code：

```bash
tracelet claude
```

直接启动 Codex：

```bash
tracelet codex
```

Agent 参数放在 `--` 后面原样传递：

```bash
tracelet claude -- --resume
tracelet codex -- --model gpt-5.6-sol
```

Agent 运行期间，CLI 会输出本地 Dashboard 地址。Agent 退出后代理服务也会退出，历史记录仍保留在本地。

单独查看历史记录：

```bash
tracelet dashboard
```

配置 Tracelet 向上游发起请求时是否使用当前 macOS 或 Windows 的固定系统代理：

```bash
tracelet proxy
```

交互式 On/Off 选项保存在 `~/.tracelet/settings.json`。启用后，Tracelet 会在 Agent 启动时读取当前系统代理；未找到固定代理时使用直连。

清除全部已记录的运行和会话信息。Tracelet 会在删除前要求确认：

```bash
tracelet clear
```

脚本等场景可以使用 `--yes` 跳过确认：

```bash
tracelet clear --yes
```

该命令只删除解析后数据目录中的 `runs/`，并重新创建空目录。清理自定义数据目录时，需要将公共参数放在子命令之前：

```bash
tracelet --data-dir ./trace-data clear --yes
```

## CLI 参数

公共参数需要放在子命令之前：

```bash
tracelet --port 4318 --data-dir ./trace-data claude
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-p, --port <port>` | `4318` | 本地代理和 Dashboard 端口，传入 `0` 时使用随机端口 |
| `--data-dir <path>` | `~/.tracelet/data` | Tracelet 本地记录目录 |
| `-V, --version` | — | 输出版本号 |
| `-h, --help` | — | 输出帮助信息 |

## 环境变量

| 环境变量 | 说明 |
| --- | --- |
| `TRACELET_DATA_DIR` | 修改默认数据目录，优先级低于 `--data-dir` |
| `TRACELET_CLAUDE_UPSTREAM` | 以最高优先级覆盖 Claude Code 原始上游地址 |
| `TRACELET_CODEX_UPSTREAM` | 覆盖 Codex 原始上游地址 |
| `CLAUDE_CONFIG_DIR` | 覆盖 Claude Code 用户配置目录 |

Claude Code 通过同时注入子进程环境变量和附加 `--settings` 对象中的 `ANTHROPIC_BASE_URL` 接入代理。CLI settings 可以避免 Claude 配置文件中已有的 `env.ANTHROPIC_BASE_URL` 再次覆盖代理地址。Codex 通过 `-c` 接收临时自定义 Provider：Base URL 指向 Tracelet，`requires_openai_auth` 复用当前登录，`supports_websockets=false` 使其直接使用 HTTP/SSE。这些覆盖只对当前子进程生效，Tracelet 不写入 Claude Code 或 Codex 的永久配置文件。

Claude upstream 的解析顺序为：

1. `TRACELET_CLAUDE_UPSTREAM`。
2. `<cwd>/.claude/settings.local.json` 中的 `env.ANTHROPIC_BASE_URL`。
3. `<cwd>/.claude/settings.json` 中的 `env.ANTHROPIC_BASE_URL`。
4. `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` 中的 `env.ANTHROPIC_BASE_URL`。
5. `https://api.anthropic.com`。

## 会话识别

Claude Code 按以下顺序识别：

1. 使用 `x-claude-code-session-id` 作为稳定会话标识。
2. 同时记录 `x-claude-code-agent-id` 和 `x-claude-code-parent-agent-id`，用于识别子 Agent 关系。
3. Header 不存在时回退到当前 Tracelet run。

Codex/OpenAI 按以下顺序识别：

1. 优先使用 Codex 的 `session-id` 或 `thread-id` Header。
2. 使用请求中的 `conversation` 或 `conversation.id`。
3. 使用 `previous_response_id` 查找前一个响应所属的会话。
4. 没有协议级标识时回退到当前 Tracelet run。

OpenAI Response Chain 当前保存在运行时内存中，因此同一次 Tracelet 运行中的连续交互可以正确关联；Tracelet 重启后的跨进程 Response Chain 恢复尚未实现。

## 数据保存位置

默认目录为：

```text
~/.tracelet/data/
└── runs/
    └── YYYY-MM-DD/
        └── run_<id>/
            ├── run.json
            └── exchanges/
                └── ex_<id>/
                    ├── meta.json
                    ├── request.bin
                    ├── request-chunks.jsonl
                    ├── response.bin
                    ├── response-chunks.jsonl
                    ├── sse-events.jsonl
                    └── reconstructed.json
```

文件职责：

| 文件 | 内容 |
| --- | --- |
| `run.json` | 本次 Agent 启动目录、命令、开始时间、结束时间和退出码 |
| `meta.json` | 协议、路径、模型、会话、状态码、脱敏 Header、字节数和捕获状态 |
| `request.bin` | 完整原始请求 body 字节，Codex 压缩请求仍保持字节一致 |
| `request-chunks.jsonl` | 请求 chunk 的索引与到达时间 |
| `response.bin` | 完整原始响应 body 字节 |
| `response-chunks.jsonl` | 响应 chunk 的索引与到达时间 |
| `sse-events.jsonl` | 从响应 chunk 中解析出的 SSE 事件及其 chunk 范围 |
| `reconstructed.json` | 官方 SDK 还原出的完整响应对象 |

每条 chunk 索引示例：

```json
{"seq":3,"tUs":128430,"offset":2048,"length":736}
```

Dashboard 根据 `offset` 和 `length` 从 `response.bin` 提取原始 chunk，并在查询时生成文本与 Base64 展示，不重复保存 chunk 内容。zstd 请求只在生成元数据或 Dashboard JSON 时对已保存的副本进行解码。

## Dashboard

Dashboard 包含以下标签：

- `中文 / EN` 切换按钮会立即更新界面，并使用 `localStorage` 保存语言选择。
- 概览：模型、协议、状态、耗时、响应大小和会话来源。
- 完整请求：从 `request.bin` 解码并解析，通过可折叠 JSON 树展示。
- 完整响应：通过官方 SDK 还原，并通过可折叠 JSON 树展示。
- JSON 操作：全部展开、展开两层、收起节点和复制完整 JSON。
- SSE 事件：查看解析后的事件类型、时间、来源 chunk 范围、格式化数据和原始事件文本。

如果流中断或官方 SDK 无法还原响应，Dashboard 会显示还原错误，同时继续提供原始响应和 chunk 记录。

## 项目结构

```text
apps/
├── cli/          # Commander CLI、Agent 启动和 Base URL 配置
└── dashboard/    # React + Vite Dashboard
packages/
├── protocols/    # 请求解析和官方 SDK 流还原
├── proxy/        # HTTP/HTTPS 透明转发
├── recorder/     # chunk、SSE、会话与捕获生命周期
├── server/       # Dashboard API、静态资源和实时通知
├── shared/       # 公共类型与工具
└── storage/      # 原始文件、JSONL 写入和查询
tests/            # 单元测试与代理集成测试
```

## 开发与校验

开发模式：

```bash
pnpm dev
```

执行全部校验：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 安全与隐私

- 服务默认仅监听 `127.0.0.1`。
- 认证 Header 在写入 `meta.json` 前会被替换为 `[REDACTED]`。
- Prompt、工具输入和模型输出仍可能包含敏感内容，并会原样保存在数据目录中。
- 请不要将 Tracelet 数据目录提交到 Git 或共享给不受信任的用户。

## 当前限制

- 尚未提供按保留期限和容量自动清理的能力。
- Dashboard 查询会扫描本地文件；数据量很大后可增加 SQLite 索引，原始 `.bin` 和 JSONL 仍可继续保留。
- OpenAI Response Chain 尚不能跨 Tracelet 进程恢复。
- 不代理或记录 WebSocket 传输；Tracelet 当前只捕获 HTTP 响应和 SSE 流。
