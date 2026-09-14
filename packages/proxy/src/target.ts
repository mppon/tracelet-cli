/** 本文件负责把 Tracelet 代理路径转换为上游地址。 */

import type { RouteInfo } from "@tracelet/shared";

/** 将本地代理路径转换为最终上游 URL。 */
export function targetUrl(route: RouteInfo, input: string): URL {
  const local = new URL(input, "http://127.0.0.1");
  const target = new URL(route.upstream);
  const suffix = local.pathname.slice(route.prefix.length).replace(/^\//, "");
  const basePath = target.pathname.replace(/\/$/, "");

  target.pathname = `${basePath}/${suffix}`;
  target.search = local.search;
  return target;
}
