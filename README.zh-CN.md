<!-- 本文件提供 Tracelet 的中文使用说明；修改时应同步更新 README.md。 -->

# Tracelet

在本地记录并查看 Claude Code 和 Codex 的 LLM 通信。

[English](./README.md)

## 简介

Tracelet 是一个使用 TypeScript 编写的命令行工具。它通过本地 HTTP 代理启动 Claude Code 或 Codex，记录 Agent 与 LLM 之间的请求和流式响应，不修改请求内容，也不永久修改 Agent 的配置。

内置 Dashboard 可以根据记录还原完整会话，并查看消息、Reasoning、工具调用、完整请求与响应以及 SSE 事件。记录默认保存在 `~/.tracelet/data`。

![Tracelet 会话视图](./docs/images/1.png)

## 安装

Tracelet 要求 Node.js 22 或更高版本，并且本机已安装并登录 `claude` 或 `codex`。

全局安装：

```bash
npm install --global tracelet-cli
tracelet
```

也可以不全局安装直接运行：

```bash
npx tracelet-cli
```

## 使用

运行 Tracelet，然后通过菜单选择 Agent：

```bash
tracelet
```

也可以直接启动指定 Agent。`--` 后面的参数会原样传递给 Agent：

```bash
tracelet claude
tracelet codex
tracelet codex -- --model gpt-5.6-sol
```

启动后，命令行会输出 Dashboard 地址。如果只想查看已有记录而不启动 Agent，可以运行：

```bash
tracelet dashboard
```

![完整响应查看器](./docs/images/2.png)

![请求与 SSE 事件](./docs/images/3.png)

其他命令：

```bash
tracelet proxy       # 开启或关闭系统代理
tracelet clear       # 清除全部会话记录
tracelet clear --yes # 跳过确认并清除记录
```

使用 `--port` 修改本地服务端口，使用 `--data-dir` 修改记录目录。公共参数需要放在子命令之前：

```bash
tracelet --port 4318 --data-dir ./trace-data codex
```

认证 Header 会在元数据写入前脱敏，但 Prompt、工具输入和模型输出仍可能包含敏感信息，请勿公开 Tracelet 数据目录。

## 本地开发

项目使用 pnpm workspace，本地开发要求 Node.js 22 或更高版本和 pnpm 11。

```bash
pnpm install
pnpm dev
```

执行检查并生成生产构建：

```bash
pnpm typecheck
pnpm test
pnpm build
```

将本地 `tracelet` 命令链接到全局：

```bash
pnpm build
cd apps/cli
npm link
tracelet
```
