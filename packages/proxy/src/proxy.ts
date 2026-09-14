/** 本文件负责透明转发 HTTP 请求与流式响应，并把流量副本交给 Recorder。 */

import http, { type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { Capture, Recorder } from "@tracelet/recorder";
import type { RouteInfo } from "@tracelet/shared";
import { requestHeaders, responseHeaders } from "./headers.js";
import { targetUrl } from "./target.js";

/** 将记录任务交给 Recorder 后台收尾。 */
function finishCapture(recorder: Recorder, capture: Capture | undefined): void {
  if (capture) {
    recorder.track(capture.end());
  }
}

/** 在记录器可用时标记捕获失败。 */
function failCapture(recorder: Recorder, capture: Capture | undefined, error: Error): void {
  if (capture) {
    recorder.track(capture.fail(error));
  }
}

export class ProxyServer {
  private readonly recorder: Recorder;
  private readonly agents = new Map<string, HttpProxyAgent<string> | HttpsProxyAgent<string>>();

  /** 创建共享 Recorder 的透明代理。 */
  constructor(recorder: Recorder) {
    this.recorder = recorder;
  }

  /** 返回当前上游协议可复用的代理 Agent。 */
  private agent(target: URL, proxy: string | undefined): HttpProxyAgent<string> | HttpsProxyAgent<string> | undefined {
    if (!proxy) {
      return undefined;
    }

    const key = `${target.protocol}:${proxy}`;
    const cached = this.agents.get(key);
    if (cached) {
      return cached;
    }

    const agent = target.protocol === "https:"
      ? new HttpsProxyAgent(proxy, { keepAlive: true })
      : new HttpProxyAgent(proxy, { keepAlive: true });
    this.agents.set(key, agent);
    return agent;
  }

  /** 关闭全部系统代理连接。 */
  close(): void {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
  }

  /** 转发一次请求，并同步记录请求体与响应流。 */
  async handle(req: IncomingMessage, res: ServerResponse, route: RouteInfo): Promise<void> {
    const target = targetUrl(route, req.url ?? "/");
    const recorder = this.recorder;
    let capture: Capture | undefined;
    let upstreamReq: ClientRequest | undefined;
    let settled = false;

    try {
      capture = await this.recorder.start({
        runId: route.runId,
        protocol: route.protocol,
        method: req.method ?? "GET",
        path: `${target.pathname}${target.search}`,
        headers: req.headers,
      });
    } catch (error) {
      // 记录器不可用时仍继续转发，避免改变 agent 的执行结果。
      console.error("Tracelet failed to start recording:", error);
    }

    const transport = target.protocol === "https:" ? https : http;
    upstreamReq = transport.request(
      target,
      {
        method: req.method,
        headers: requestHeaders(req.headers, target.host),
        // Proxy Agent 只改变上游连接路径，不修改请求内容。
        agent: this.agent(target, route.proxy),
      },
      (upstreamRes) => {
        capture?.resStart(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders(upstreamRes.headers));

        /** 立即转发响应 chunk，同时保留其原始副本。 */
        function onData(chunk: Buffer): void {
          capture?.resChunk(chunk);
          if (!res.write(chunk)) {
            upstreamRes.pause();
            res.once("drain", () => upstreamRes.resume());
          }
        }

        /** 正常结束下游响应与捕获任务。 */
        function onEnd(): void {
          settled = true;
          res.end();
          finishCapture(recorder, capture);
        }

        /** 将上游响应流错误传递给客户端并终止捕获。 */
        function onError(error: Error): void {
          settled = true;
          res.destroy(error);
          failCapture(recorder, capture, error);
        }

        upstreamRes.on("data", onData);
        upstreamRes.once("end", onEnd);
        upstreamRes.once("error", onError);
      },
    );

    /** 转发并记录请求 body chunk。 */
    function onReqData(chunk: Buffer): void {
      capture?.reqChunk(chunk);
      upstreamReq?.write(chunk);
    }

    /** 请求体结束后完成解析并关闭上游写入端。 */
    function onReqEnd(): void {
      capture?.reqEnd();
      upstreamReq?.end();
    }

    /** 处理建立上游连接时发生的错误。 */
    const onUpstreamError = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "upstream_unavailable" }));
      } else {
        res.destroy(error);
      }
      failCapture(this.recorder, capture, error);
    };

    /** 客户端提前断开时同步取消上游请求。 */
    function onClientClose(): void {
      if (!res.writableEnded && !settled) {
        upstreamReq?.destroy(new Error("Client disconnected"));
      }
    }

    upstreamReq.once("error", onUpstreamError);
    req.on("data", onReqData);
    req.once("end", onReqEnd);
    res.once("close", onClientClose);
  }
}
