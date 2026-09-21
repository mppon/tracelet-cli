<div align="center">
  <h1>Tracelet</h1>
  <p>Capture and explore LLM conversations from Claude Code, Codex, and custom agents.</p>
  <p>
    <a href="https://www.npmjs.com/package/tracelet-cli"><img alt="npm version" src="https://img.shields.io/npm/v/tracelet-cli?style=flat-square"></a>
    <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white&style=flat-square">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square">
    <img alt="vibe-coding" src="https://img.shields.io/badge/vibe--coding-on-8A2BE2?style=flat-square">
  </p>
</div>

## Introduction

- 🔌 Capture LLM requests and streaming responses from Claude Code, Codex, and custom agents.
- 🚀 Inject the local Base URL through environment variables or temporary launch arguments without changing an agent's saved configuration.
- 🧩 Reconstruct complete responses and conversations, including messages, reasoning, and tool calls.
- 🔎 Inspect requests, responses, and SSE events in a local Dashboard.
- 💾 Keep traces locally and view them again without starting an agent.

## Installation

Requires Node.js 22 or later. For built-in agents, install and authenticate Claude Code or Codex first.

```bash
npm install --global tracelet-cli
```

## Usage

### `tracelet` — choose an agent

```console
$ tracelet
? Select an agent to trace Claude Code
Tracelet Dashboard: http://127.0.0.1:4318
Starting Claude Code...
```

### `tracelet claude` / `tracelet codex` — start directly

```console
$ tracelet codex
Tracelet Dashboard: http://127.0.0.1:4318
Starting Codex...
```

Agent options are passed through directly, for example `tracelet codex --model gpt-5.6-sol`.

### `tracelet agent` — manage custom agents

```console
$ tracelet agent
? Manage custom agents Add agent
? Agent name My Agent
...
Agent saved: custom-my-agent
```

The same menu can edit or delete an agent. Run a saved agent by ID:

```console
$ tracelet run custom-my-agent
Tracelet Dashboard: http://127.0.0.1:4318
Starting My Agent...
```

### `tracelet dashboard` — inspect existing traces

```console
$ tracelet dashboard
Tracelet Dashboard: http://127.0.0.1:4318
```

### `tracelet proxy` — configure upstream proxy use

```console
$ tracelet proxy
? Select an agent to configure Codex (Off)
? Use the system proxy for upstream requests? On
System proxy enabled for Codex.
```

### `tracelet clear` — delete recorded history

```console
$ tracelet clear
? This will permanently delete all Tracelet records in /Users/you/.tracelet/data. Continue? Yes
All Tracelet records cleared: /Users/you/.tracelet/data
```

⚠️ Traces can contain prompts, tool inputs, and model outputs. Keep your local data directory private.

## Links

- GitHub: https://github.com/mppon/tracelet-cli
- Issues: https://github.com/mppon/tracelet-cli/issues