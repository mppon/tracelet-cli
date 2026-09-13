/** 本文件负责安全地返回 Dashboard 静态资源。 */

import type { ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** 判断文件路径是否位于 Dashboard 构建目录内。 */
function isInside(root: string, file: string): boolean {
  return file === root || file.startsWith(`${root}${sep}`);
}

/** 返回静态资源；未知前端路由回退到 index.html。 */
export async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<void> {
  const base = resolve(root);
  const requested = resolve(base, `.${pathname}`);
  let target = requested;

  if (!isInside(base, requested)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    if ((await stat(target)).isDirectory()) {
      target = resolve(target, "index.html");
    }
  } catch {
    target = resolve(base, "index.html");
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": contentTypes?.[extname(target)] ?? "application/octet-stream",
      "cache-control": target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(body);
  } catch {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("Dashboard 尚未构建，请先运行 pnpm build。\n");
  }
}
