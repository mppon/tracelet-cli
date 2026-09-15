<!-- This file provides the English documentation for Tracelet. When modifying this file, the agent must update README.zh-CN.md at the same time to keep both versions consistent. -->

# Tracelet

Tracelet is a local traffic recorder for Claude Code and Codex.

[简体中文](./README.zh-CN.md)

## Overview

Tracelet is a local command-line tool written in TypeScript. It starts a local HTTP proxy, temporarily points the Base URL of the current Claude Code or Codex process to that proxy, and records requests sent to the LLM, upstream responses, and every stream chunk observed by the proxy.

Tracelet does not modify request bodies. The proxy only forwards traffic, removes its internal route prefix, handles required hop-by-hop HTTP headers, and stores a local copy of the traffic. Tracelet never writes to permanent Claude Code or Codex configuration files.

## Requirements

- Node.js 22 or later
- pnpm 11
- An installed and authenticated `claude` or `codex` command

## Quick Start

```bash
# 1. Build
pnpm install
pnpm build

# 2. Start Claude Code or Codex through the proxy
node apps/cli/dist/bin.js

# 3. Open the Dashboard URL printed by the CLI
#    http://127.0.0.1:4318
```

Optionally create a development link for the global `tracelet` command:

```bash
cd apps/cli
npm link
tracelet
```

## Usage

### Record a session

Run without a subcommand to choose Claude Code or Codex interactively:

```bash
tracelet
```

Or start a specific agent directly:

```bash
tracelet claude
tracelet codex
```

Agent arguments placed after `--` are passed through unchanged:

```bash
tracelet claude -- --resume
tracelet codex -- --model gpt-5.6-sol
```

While the agent runs, the CLI prints the local Dashboard URL. The proxy exits when the agent exits, while recorded history remains available on disk.

### View recorded traffic

Start a standalone Dashboard for existing records. It keeps running until you press `Ctrl+C`:

```bash
tracelet dashboard
```

The Dashboard provides:

- Conversation view: rebuilds the complete session from existing records, with user messages on the right, AI messages on the left, and tool calls as linked timeline cards.
- Conversation filters: switch among messages, tool calls, and reasoning, with internal title/summary tasks hidden by default.
- Requests view: lists the underlying LLM requests for the selected session and opens the selected exchange in the inspector.
- Overview: model, protocol, status, duration, response size, and session source.
- Complete Request: the full request decoded and parsed from `request.bin`, shown as a collapsible JSON tree.
- Complete Response: the response object reconstructed by the official SDK, shown as a collapsible JSON tree.
- JSON controls: expand all, expand two levels, collapse nodes, and copy the complete JSON.
- SSE Events: parsed event type, timing, source chunk range, formatted data, and raw event text.
- A `中文 / EN` switch that updates the interface immediately and persists the selection in `localStorage`.

If a stream is interrupted or the SDK cannot reconstruct the response, the Dashboard reports the reconstruction error while retaining the raw response and chunk records.

### Configure the system proxy

Configure whether Tracelet uses the current macOS or Windows fixed system proxy for its own upstream requests:

```bash
tracelet proxy
```

The interactive On/Off choice is saved in `~/.tracelet/settings.json`. When enabled, Tracelet reads the active system proxy at Agent startup. If no fixed proxy is found, Tracelet uses a direct connection.

### Clear history

Clear all recorded runs and sessions. Tracelet asks for confirmation before deleting them:

```bash
tracelet clear
```

Use `--yes` to skip the confirmation, for example in a script:

```bash
tracelet clear --yes
```

The command only removes the resolved data directory's `runs/` folder and recreates it empty. To clear a custom data directory, place the shared option before the subcommand:

```bash
tracelet --data-dir ./trace-data clear --yes
```

### CLI options

Shared options must be placed before the subcommand:

```bash
tracelet --port 4318 --data-dir ./trace-data codex
```

| Option | Default | Description |
| --- | --- | --- |
| `-p, --port <port>` | `4318` | Local proxy and Dashboard port; use `0` for a random port |
| `--data-dir <path>` | `~/.tracelet/data` | Local trace data directory |
| `-V, --version` | — | Print the version |
| `-h, --help` | — | Print command help |

The data directory resolves as `--data-dir` > `TRACELET_DATA_DIR` > `~/.tracelet/data`.

### Environment variables

| Variable | Description |
| --- | --- |
| `TRACELET_DATA_DIR` | Overrides the default data directory; `--data-dir` has higher priority |
| `TRACELET_CLAUDE_UPSTREAM` | Highest-priority override for the original Claude Code upstream URL |
| `TRACELET_CODEX_UPSTREAM` | Overrides the original Codex upstream URL |
| `CLAUDE_CONFIG_DIR` | Overrides the Claude Code user configuration directory |

Claude Code connects through an `ANTHROPIC_BASE_URL` value injected into both the child-process environment and an additional `--settings` object. The CLI setting prevents an existing `env.ANTHROPIC_BASE_URL` in Claude settings files from bypassing the proxy. Codex receives a temporary custom provider through `-c`; its Base URL points to Tracelet, `requires_openai_auth` reuses the current login, and `supports_websockets=false` makes it use HTTP/SSE directly. These overrides only affect the child process.

Claude upstream resolution order:

1. `TRACELET_CLAUDE_UPSTREAM`.
2. `env.ANTHROPIC_BASE_URL` in `<cwd>/.claude/settings.local.json`.
3. `env.ANTHROPIC_BASE_URL` in `<cwd>/.claude/settings.json`.
4. `env.ANTHROPIC_BASE_URL` in `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`.
5. `https://api.anthropic.com`.

## What gets recorded

- Byte-preserving request and response bodies. Codex requests with `Content-Encoding: zstd` remain byte-identical on disk; decoding is read-only and used for parsing and display only.
- Sequence, arrival time, offset, and length for every request and response chunk.
- SSE events parsed incrementally across arbitrary chunk boundaries.
- The complete streamed response, reconstructed through official SDK methods:
  - Anthropic: `MessageStream.fromReadableStream(...).finalMessage()`
  - OpenAI: `ResponseStream.fromReadableStream(...).finalResponse()`
- Session grouping through Claude Session Headers, OpenAI Conversations, and Response Chains.

> A Tracelet chunk is delivered through a Node.js Stream `data` event and is not guaranteed to match a single TCP packet or SSE event.

### Session detection

Claude Code detection order:

1. Use `x-claude-code-session-id` as the stable session identifier.
2. Record `x-claude-code-agent-id` and `x-claude-code-parent-agent-id` for sub-agent relationships.
3. Fall back to the current Tracelet run when the headers are unavailable.

Codex/OpenAI detection order:

1. Use Codex `session-id` or `thread-id` headers when available.
2. Use `conversation` or `conversation.id` from the request.
3. Resolve `previous_response_id` to the session of the previous response.
4. Fall back to the current Tracelet run when no protocol-level identifier is available.

The OpenAI Response Chain map currently lives in process memory. Consecutive interactions within one Tracelet run are grouped correctly, but Response Chain recovery across Tracelet restarts is not implemented yet.

## Data location and format

The default directory layout is:

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

| File | Content |
| --- | --- |
| `run.json` | Agent working directory, command, timestamps, and exit code |
| `meta.json` | Protocol, path, model, session, status, redacted headers, byte counts, and capture status |
| `request.bin` | Complete raw request body bytes; compressed Codex requests remain byte-identical |
| `request-chunks.jsonl` | Request chunk indexes and arrival times |
| `response.bin` | Complete raw response body bytes |
| `response-chunks.jsonl` | Response chunk indexes and arrival times |
| `sse-events.jsonl` | Parsed SSE events and their source chunk ranges |
| `reconstructed.json` | Complete response object produced by the official SDK |

Example chunk index:

```json
{"seq":3,"tUs":128430,"offset":2048,"length":736}
```

The Dashboard uses `offset` and `length` to extract each original chunk from `response.bin`. Text and Base64 views are generated when queried, so chunk data is not stored twice. A zstd request is decoded only from its stored copy when metadata or Dashboard JSON is generated.

## Development

Project structure:

```text
apps/
├── cli/          # Commander CLI, Agent launch, and Base URL configuration
└── dashboard/    # React and Vite Dashboard
packages/
├── protocols/    # Request parsing and official SDK stream reconstruction
├── proxy/        # HTTP/HTTPS forwarding
├── recorder/     # Chunk, SSE, session, and capture lifecycle
├── server/       # Dashboard API, static assets, and live updates
├── shared/       # Shared types and utilities
└── storage/      # Raw files, JSONL writing, and queries
tests/            # Unit and proxy integration tests
```

Run in development mode:

```bash
pnpm dev
```

Run all checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Security and privacy

- The service listens on `127.0.0.1` by default.
- Authentication headers are replaced with `[REDACTED]` before being written to `meta.json`.
- Prompts, tool inputs, and model outputs may still contain sensitive data and are stored unchanged in the data directory.
- Do not commit the Tracelet data directory to Git or share it with untrusted users.

## Current limitations

- Retention policies and capacity-based cleanup are not implemented yet.
- Dashboard queries scan local files. A SQLite index can be added for large datasets while retaining raw `.bin` and JSONL files.
- OpenAI Response Chains cannot yet be restored across Tracelet processes.
- WebSocket transport is not proxied or recorded; Tracelet currently captures HTTP responses and SSE streams.
