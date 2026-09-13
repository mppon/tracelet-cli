/** 本文件负责向 Dashboard 推送本地记录变化事件。 */

import type { ServerResponse } from "node:http";

export class LiveBus {
  private readonly clients = new Set<ServerResponse>();

  /** 注册一个 Dashboard SSE 连接。 */
  connect(res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("event: ready\ndata: {}\n\n");
    this.clients.add(res);
    const clients = this.clients;

    /** 连接结束时从广播集合移除客户端。 */
    function remove(): void {
      clients.delete(res);
    }

    res.once("close", remove);
  }

  /** 向全部 Dashboard 连接发送数据变化通知。 */
  publish(type: string, data: unknown): void {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(message);
    }
  }

  /** 关闭全部 Dashboard SSE 连接。 */
  close(): void {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }
}
