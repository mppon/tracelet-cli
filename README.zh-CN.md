<!-- 本文件提供 Tracelet 的中文使用说明；修改时应同步更新 README.md。 -->

<div align="center">
  <h1>Tracelet</h1>
  <p>记录并查看 Claude Code、Codex 与自定义 Agent 的 LLM 对话。</p>
  <p>
    <a href="https://www.npmjs.com/package/tracelet-cli"><img alt="npm version" src="https://img.shields.io/npm/v/tracelet-cli?style=flat-square"></a>
    <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white&style=flat-square">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square">
    <img alt="vibe-coding" src="https://img.shields.io/badge/vibe--coding-on-8A2BE2?style=flat-square">
  </p>
  <p><a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a></p>
</div>

## 项目简介

- 🔌 采集 Claude Code、Codex 和自定义 Agent 的 LLM 请求与流式响应。
- 🚀 启动时通过环境变量或临时参数注入本地 Base URL，不修改 Agent 原有配置。
- 🧩 还原完整响应和会话，包括消息、Reasoning 与工具调用。
- 🔎 在本地 Dashboard 查看请求、响应和 SSE 事件。
- 💾 本地保存记录，无需启动 Agent 也能随时回看。

![Tracelet 会话视图](./docs/images/1.png)

## 安装

要求 Node.js 22 或更高版本。使用内置 Agent 前，需先安装并登录 Claude Code 或 Codex。

```bash
npm install --global tracelet-cli
```

## 使用

### `tracelet`：交互选择 Agent

```console
$ tracelet
? Select an agent to trace Claude Code
Tracelet Dashboard: http://127.0.0.1:4318
Starting Claude Code...
```

### `tracelet claude` / `tracelet codex`：直接启动

```console
$ tracelet codex
Tracelet Dashboard: http://127.0.0.1:4318
Starting Codex...
```

Agent 参数会直接透传，例如 `tracelet codex --model gpt-5.6-sol`。

### `tracelet agent`：管理自定义 Agent

```console
$ tracelet agent
? Manage custom agents Add agent
? Agent name My Agent
...
Agent saved: custom-my-agent
```

同一菜单也能编辑或删除 Agent。保存后可通过 ID 启动：

```console
$ tracelet run custom-my-agent
Tracelet Dashboard: http://127.0.0.1:4318
Starting My Agent...
```

### `tracelet dashboard`：查看已有记录

```console
$ tracelet dashboard
Tracelet Dashboard: http://127.0.0.1:4318
```

![完整响应查看器](./docs/images/2.png)

![请求与 SSE 事件](./docs/images/3.png)

### `tracelet proxy`：配置上游代理

```console
$ tracelet proxy
? Select an agent to configure Codex (Off)
? Use the system proxy for upstream requests? On
System proxy enabled for Codex.
```

### `tracelet clear`：清除历史记录

```console
$ tracelet clear
? This will permanently delete all Tracelet records in /Users/you/.tracelet/data. Continue? Yes
All Tracelet records cleared: /Users/you/.tracelet/data
```

⚠️ 记录可能包含提示词、工具输入和模型输出，请妥善保管本地数据目录。
