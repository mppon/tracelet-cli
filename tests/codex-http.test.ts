/** 本文件验证 Codex zstd HTTP 请求的透明转发和历史记录恢复。 */

import http, { type Server } from "node:http";
import { mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceletServer } from "@tracelet/server";
import type { RunMeta } from "@tracelet/shared";
import { getExchange, listSessions } from "@tracelet/storage";
import { describe, expect, it } from "vitest";

const zstd = "KLUv/QRYaQEAeyJtb2RlbCI6ImdwdC10ZXN0Iiwic3RyZWFtIjp0cnVlLCJpbnB1dCI6W119dvbudA==";

/** 让测试服务监听随机回环端口并返回其 URL。 */
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

/** 将对象编码为一条 SSE 事件。 */
function block(value: unknown): string {
  const type = (value as { type?: string }).type ?? "message";
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
}

describe("Codex HTTP", () => {
  /** 验证压缩字节保持不变，且 Dashboard 可以恢复请求与响应。 */
  it("记录 zstd 请求和 lite 响应", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-codex-"));
    const dashboard = join(root, "dashboard");
    await mkdir(dashboard);
    const compressed = Buffer.from(zstd, "base64");
    const received: Buffer[] = [];
    const response = {
      id: "resp_codex",
      object: "response",
      created_at: 1,
      status: "in_progress",
      output: [],
      error: null,
      incomplete_details: null,
      model: "gpt-test",
    };
    const item = {
      id: "msg_codex",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "完成", annotations: [], logprobs: [] }],
    };
    const events = [
      { type: "response.created", sequence_number: 0, response },
      { type: "response.output_item.added", sequence_number: 1, output_index: 0, item },
      { type: "response.output_item.done", sequence_number: 2, output_index: 0, item },
      {
        type: "response.completed",
        sequence_number: 3,
        response: { ...response, status: "completed", completed_at: 2 },
      },
    ];
    const upstream = http.createServer((req, res) => {
      req.on("data", (chunk: Buffer) => received.push(chunk));
      req.once("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(events.map(block).join(""));
      });
    });
    const upstreamUrl = await listen(upstream);
    const tracelet = new TraceletServer({ dataDir: root, dashboardDir: dashboard });
    await tracelet.listen(0);
    const run: RunMeta = {
      id: "run_codex",
      agent: "codex",
      cwd: root,
      command: "codex",
      startedAt: "2026-09-13T00:00:00.000Z",
    };
    const proxyUrl = await tracelet.addRun(run, "openai", upstreamUrl);

    const result = await fetch(`${proxyUrl}/responses`, {
      method: "POST",
      headers: {
        "content-encoding": "zstd",
        "content-type": "application/json",
        "session-id": "session-http",
      },
      body: compressed,
    });
    await result.text();
    await tracelet.close();
    await close(upstream);

    expect(Buffer.concat(received)).toEqual(compressed);
    const sessions = await listSessions(root);
    expect(sessions[0]?.id).toBe("codex:session-http");
    const exchange = sessions[0]?.exchanges[0];
    const detail = await getExchange(root, exchange?.id ?? "");
    expect(detail?.request).toMatchObject({ model: "gpt-test", stream: true });
    expect(detail?.response).toMatchObject({ status: "completed", output_text: "完成" });

    // 删除临时测试中的派生文件，验证旧记录也能从 SSE 事件即时恢复。
    const exchangeDir = join(
      root,
      "runs",
      "2026-09-13",
      run.id,
      "exchanges",
      exchange?.id ?? "",
    );
    const reconstructed = join(exchangeDir, "reconstructed.json");
    await unlink(reconstructed);
    const metaPath = join(exchangeDir, "meta.json");
    const oldMeta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
    oldMeta.stream = false;
    oldMeta.sessionId = `run:${run.id}`;
    oldMeta.sessionSource = "run";
    oldMeta.reconstructError = "旧版本未能解析 SSE";
    delete oldMeta.model;
    await writeFile(metaPath, JSON.stringify(oldMeta), "utf8");

    const restored = await getExchange(root, exchange?.id ?? "");
    expect(restored?.meta).toMatchObject({
      model: "gpt-test",
      stream: true,
      sessionId: "codex:session-http",
    });
    expect(restored?.response).toMatchObject({ status: "completed", output_text: "完成" });
    expect(restored?.meta.reconstructError).toBeUndefined();
  });
});
