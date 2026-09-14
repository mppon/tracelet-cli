/** 本文件负责组合 HTTP 代理、记录器、文件存储和 Dashboard 服务。 */

import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ProxyServer } from "@tracelet/proxy";
import { Recorder } from "@tracelet/recorder";
import type { Protocol, RouteInfo, RunMeta } from "@tracelet/shared";
import { FileStore } from "@tracelet/storage";
import { serveApi } from "./api.js";
import { LiveBus } from "./live.js";
import { serveStatic } from "./static.js";

export interface ServerOptions {
  dataDir: string;
  dashboardDir: string;
  host?: string;
}

export class TraceletServer {
  readonly dataDir: string;
  private readonly host: string;
  private readonly dashboardDir: string;
  private readonly store: FileStore;
  private readonly recorder: Recorder;
  private readonly proxy: ProxyServer;
  private readonly live = new LiveBus();
  private readonly routes = new Map<string, RouteInfo>();
  private readonly server: Server;
  private port = 0;

  /** 创建本地 Tracelet HTTP 服务。 */
  constructor(options: ServerOptions) {
    this.dataDir = options.dataDir;
    this.host = options.host ?? "127.0.0.1";
    this.dashboardDir = options.dashboardDir;
    this.store = new FileStore(this.dataDir);
    this.recorder = new Recorder(this.store, (meta) => this.live.publish("change", { id: meta.id }));
    this.proxy = new ProxyServer(this.recorder);
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        } else {
          res.destroy();
        }
      });
    });
  }

  /** 初始化文件存储并监听本地端口。 */
  async listen(port: number): Promise<void> {
    await this.store.init();

    await new Promise<void>((resolve, reject) => {
      /** 监听成功后记录系统实际分配的端口。 */
      const onListen = (): void => {
        const address = this.server.address();
        this.port = typeof address === "object" && address ? address.port : port;
        resolve();
      };

      this.server.once("error", reject);
      this.server.listen(port, this.host, onListen);
    });
  }

  /** 返回当前 Dashboard 地址。 */
  url(): string {
    return `http://${this.host}:${this.port}`;
  }

  /** 注册一次 agent 运行及其固定上游地址。 */
  async addRun(run: RunMeta, protocol: Protocol, upstream: string, proxy?: string): Promise<string> {
    await this.store.startRun(run);
    const prefix = `/_tracelet/p/${run.id}/${protocol}`;
    this.routes.set(prefix, { runId: run.id, protocol, upstream, prefix, ...(proxy ? { proxy } : {}) });
    return `${this.url()}${prefix}`;
  }

  /** 更新运行结束信息并广播 Dashboard。 */
  async finishRun(run: RunMeta): Promise<void> {
    await this.store.finishRun(run);
    this.live.publish("change", { runId: run.id });
  }

  /** 等待记录写入完成并关闭 HTTP 服务。 */
  async close(): Promise<void> {
    await this.recorder.drain();
    this.live.close();

    await new Promise<void>((resolve, reject) => {
      /** 将 Node 回调式 close 转换为 Promise。 */
      function onClose(error?: Error): void {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      this.server.close(onClose);
    });
    this.proxy.close();
  }

  /** 将请求分发到代理、Dashboard API 或静态资源。 */
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.url());
    const route = this.findRoute(url.pathname);

    if (route) {
      await this.proxy.handle(req, res, route);
      return;
    }

    if (url.pathname.startsWith("/api/") && (await serveApi(req, res, url.pathname, this.dataDir, this.live))) {
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(404);
      res.end();
      return;
    }

    await serveStatic(this.dashboardDir, url.pathname, res);
  }

  /** 查找一个本地代理路径对应的运行路由。 */
  private findRoute(path: string): RouteInfo | undefined {
    return [...this.routes.values()].find(
      (item) => path === item.prefix || path.startsWith(`${item.prefix}/`),
    );
  }

}
