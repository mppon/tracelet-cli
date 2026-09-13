<!-- This file provides the English documentation for Tracelet. When modifying this file, the agent must update README.zh-CN.md at the same time to keep both versions consistent. -->

# Tracelet

Tracelet is a local traffic recorder for Claude Code and Codex.

[简体中文](./README.zh-CN.md)

## Overview

Tracelet is a local command-line tool written in TypeScript. It starts a local HTTP proxy, temporarily points the Base URL of the current Claude Code or Codex process to that proxy, and records requests sent to the LLM, upstream responses, and every stream chunk observed by the proxy.

Tracelet does not modify request bodies. The proxy only forwards traffic, removes its internal route prefix, handles required hop-by-hop HTTP headers, and stores a local copy of the traffic.

## Features

- Commander-based CLI with an interactive Claude Code/Codex selector.
- Per-process Base URL overrides without changing global Agent configuration.
- Byte-preserving request and response body storage.
- Sequence, arrival time, offset, and length for every request and response chunk.
- Incremental SSE parsing across arbitrary chunk boundaries.
- Complete streamed-response reconstruction through official SDK methods:
  - Anthropic: `MessageStream.fromReadableStream(...).finalMessage()`
  - OpenAI: `ResponseStream.fromReadableStream(...).finalResponse()`
- Session grouping through Claude Session Headers, OpenAI Conversations, and Response Chains.
- Local Dashboard with Complete Request, Complete Response, and SSE Chunks tabs.
- Chinese and English Dashboard UI with browser detection and persistent language selection.
- Automatic redaction of Authorization, API Key, and Cookie headers before persistence.
- Raw binary and JSONL storage with no database dependency.

> A Tracelet chunk is a chunk delivered to the proxy through a Node.js Stream `data` event. It is not guaranteed to match a single TCP packet.

## Requirements

- Node.js 22 or later
- pnpm 11
- An installed and authenticated `claude` or `codex` command

## Install and build

```bash
pnpm install
pnpm build
```

Run the built CLI directly:

```bash
node apps/cli/dist/bin.js
```

Optionally create a development link for the global `tracelet` command:

```bash
cd apps/cli
npm link
tracelet
```

## Usage

Run without a subcommand to choose Claude Code or Codex interactively:

```bash
tracelet
```

Start Claude Code directly:

```bash
tracelet claude
```

Start Codex directly:

```bash
tracelet codex
```

Place Agent arguments after `--` so they are passed through unchanged:

```bash
tracelet claude -- --resume
tracelet codex -- --model gpt-5.6-sol
```

The CLI prints the local Dashboard URL while the Agent is running. The proxy exits with the Agent, while recorded history remains available on disk.

Start a standalone Dashboard for existing records:

```bash
tracelet dashboard
```

## CLI options

Place shared options before the subcommand:

```bash
tracelet --port 4318 --data-dir ./trace-data codex
```

| Option | Default | Description |
| --- | --- | --- |
| `-p, --port <port>` | `4318` | Local proxy and Dashboard port; use `0` for a random port |
| `--data-dir <path>` | `~/.tracelet/data` | Local trace data directory |
| `-V, --version` | — | Print the version |
| `-h, --help` | — | Print command help |

## Environment variables

| Variable | Description |
| --- | --- |
| `TRACELET_DATA_DIR` | Overrides the default data directory; `--data-dir` has higher priority |
| `TRACELET_CLAUDE_UPSTREAM` | Highest-priority override for the original Claude Code upstream URL |
| `TRACELET_CODEX_UPSTREAM` | Overrides the original Codex upstream URL |
| `CLAUDE_CONFIG_DIR` | Overrides the Claude Code user configuration directory |

Claude Code connects through an `ANTHROPIC_BASE_URL` value injected into both the child-process environment and an additional `--settings` object. The CLI setting prevents an existing `env.ANTHROPIC_BASE_URL` in Claude settings files from bypassing the proxy. Codex connects through a per-process `openai_base_url` setting. Tracelet does not write to permanent Claude Code or Codex configuration files.

Claude upstream resolution order:

1. `TRACELET_CLAUDE_UPSTREAM`.
2. `env.ANTHROPIC_BASE_URL` in `<cwd>/.claude/settings.local.json`.
3. `env.ANTHROPIC_BASE_URL` in `<cwd>/.claude/settings.json`.
4. `env.ANTHROPIC_BASE_URL` in `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`.
5. `https://api.anthropic.com`.

## Session detection

Claude Code detection order:

1. Use `x-claude-code-session-id` as the stable session identifier.
2. Record `x-claude-code-agent-id` and `x-claude-code-parent-agent-id` for sub-agent relationships.
3. Fall back to the current Tracelet run when the headers are unavailable.

Codex/OpenAI detection order:

1. Use `conversation` or `conversation.id` from the request.
2. Resolve `previous_response_id` to the session of the previous response.
3. Fall back to the current Tracelet run when no protocol-level identifier is available.

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
| `request.bin` | Complete raw request body bytes |
| `request-chunks.jsonl` | Request chunk indexes and arrival times |
| `response.bin` | Complete raw response body bytes |
| `response-chunks.jsonl` | Response chunk indexes and arrival times |
| `sse-events.jsonl` | Parsed SSE events and their source chunk ranges |
| `reconstructed.json` | Complete response object produced by the official SDK |

Example chunk index:

```json
{"seq":3,"tUs":128430,"offset":2048,"length":736}
```

The Dashboard uses `offset` and `length` to extract each original chunk from `response.bin`. Text and Base64 views are generated when queried, so chunk data is not stored twice.

## Dashboard

The Dashboard provides:

- A `中文 / EN` switch that updates the interface immediately and persists the selection in `localStorage`.
- Overview: model, protocol, status, duration, response size, and session source.
- Complete Request: the full request parsed from `request.bin`, shown as a collapsible JSON tree.
- Complete Response: the response object reconstructed by the official SDK, shown as a collapsible JSON tree.
- JSON controls: expand all, expand two levels, collapse nodes, and copy the complete JSON.
- SSE Chunks: arrival order, timing, length, offset, text, and Base64.

If a stream is interrupted or the SDK cannot reconstruct the response, the Dashboard reports the reconstruction error while retaining the raw response and chunk records.

## Project structure

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

## Development and verification

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

- Record deletion, retention policies, and storage cleanup commands are not implemented yet.
- Dashboard queries scan local files. A SQLite index can be added for large datasets while retaining raw `.bin` and JSONL files.
- OpenAI Response Chains cannot yet be restored across Tracelet processes.
- Only HTTP/HTTPS traffic routed through a configurable Base URL is supported.
