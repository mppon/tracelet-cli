/** 本文件负责处理 Dashboard 使用的本地只读 API。 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getConversation, getExchange, listSessions } from "@tracelet/storage";
import { LiveBus } from "./live.js";

/** 返回 JSON 响应。 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

/** 处理一个 Dashboard API 请求，并返回是否已匹配。 */
export async function serveApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  dataDir: string,
  live: LiveBus,
): Promise<boolean> {
  if (req.method === "GET" && pathname === "/api/live") {
    live.connect(res);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/sessions") {
    sendJson(res, 200, { sessions: await listSessions(dataDir) });
    return true;
  }

  const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (req.method === "GET" && conversationMatch?.[1]) {
    const conversation = await getConversation(dataDir, decodeURIComponent(conversationMatch[1]));
    sendJson(res, conversation ? 200 : 404, conversation ?? { error: "conversation_not_found" });
    return true;
  }

  const exchangeMatch = pathname.match(/^\/api\/exchanges\/([^/]+)$/);
  if (req.method === "GET" && exchangeMatch?.[1]) {
    const exchange = await getExchange(dataDir, decodeURIComponent(exchangeMatch[1]));
    sendJson(res, exchange ? 200 : 404, exchange ?? { error: "exchange_not_found" });
    return true;
  }

  return false;
}
