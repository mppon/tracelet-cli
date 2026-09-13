/** 本文件验证透明代理、原始记录、会话聚合和 SDK 响应还原的完整链路。 */

import http, { type Server } from "node:http";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceletServer } from "@tracelet/server";
import { getExchange, listSessions } from "@tracelet/storage";
import type { RunMeta } from "@tracelet/shared";
import { describe, expect, it } from "vitest";

/** 让测试 HTTP 服务监听随机回环端口并返回其 URL。 */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("测试服务未获得 TCP 端口");
  }
  return `http://127.0.0.1:${address.port}`;
}

/** 关闭测试 HTTP 服务。 */
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** 构建一个标准 Anthropic SSE block。 */
function block(value: unknown): string {
  const type = (value as { type?: string })?.type ?? "message";
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
}

describe("Tracelet proxy", () => {
  /** 验证请求字节不变、Claude 会话识别和 finalMessage 结果落盘。 */
  it("完成一次 Anthropic 流式记录", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-test-"));
    const dashboard = join(root, "dashboard");
    await mkdir(dashboard);
    let upstreamBody = "";
    const events = [
      {
        type: "message_start",
        message: {
          id: "msg_proxy",
          type: "message",
          role: "assistant",
          content: [],
          model: "claude-test",
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 2, output_tokens: 0 },
        },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "完成" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      },
      { type: "message_stop" },
    ];
    const sse = events.map(block).join("");
    const upstream = http.createServer((req, res) => {
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        upstreamBody += chunk;
      });
      req.once("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        // 故意从事件中间拆分，验证代理记录的是网络数据而非重组结果。
        res.write(sse.slice(0, 83));
        res.end(sse.slice(83));
      });
    });
    const upstreamUrl = await listen(upstream);
    const tracelet = new TraceletServer({ dataDir: root, dashboardDir: dashboard });
    await tracelet.listen(0);
    const run: RunMeta = {
      id: "run_proxy",
      agent: "claude",
      cwd: root,
      command: "claude",
      startedAt: new Date().toISOString(),
    };
    const proxyUrl = await tracelet.addRun(run, "anthropic", upstreamUrl);
    const requestBody = JSON.stringify({ model: "claude-test", stream: true, messages: [] });

    const response = await fetch(`${proxyUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-claude-code-session-id": "session-proxy",
      },
      body: requestBody,
    });
    expect(await response.text()).toBe(sse);
    expect(upstreamBody).toBe(requestBody);

    await tracelet.close();
    await close(upstream);

    const sessions = await listSessions(root);
    expect(sessions[0]?.id).toBe("claude:session-proxy");
    const detail = await getExchange(root, sessions[0]?.exchanges[0]?.id ?? "");
    expect(detail?.request).toMatchObject({ model: "claude-test", stream: true });
    expect(detail?.response).toMatchObject({ id: "msg_proxy", content: [{ text: "完成" }] });
    expect(detail?.chunks.length).toBeGreaterThan(0);
  });
});
