/** 本文件负责读取 macOS 和 Windows 当前用户的固定系统代理。 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const winKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

/** 从命令输出中读取一个键的值。 */
function lineValue(output: string, key: string): string | undefined {
  return output.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "m"))?.[1];
}

/** 将主机和端口转换为 HTTP 代理 URL。 */
function proxyUrl(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) {
    return undefined;
  }

  try {
    const url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `http://${input}`);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString().replace(/\/$/, "")
      : undefined;
  } catch {
    return undefined;
  }
}

/** 解析 scutil 输出中的固定 HTTPS 或 HTTP 系统代理。 */
export function parseMacProxy(output: string): string | undefined {
  /** 读取一个已启用协议的代理地址。 */
  function read(kind: "HTTP" | "HTTPS"): string | undefined {
    if (lineValue(output, `${kind}Enable`) !== "1") {
      return undefined;
    }
    const host = lineValue(output, `${kind}Proxy`);
    const port = lineValue(output, `${kind}Port`);
    return host && /^\d+$/.test(port ?? "") ? proxyUrl(`${host}:${port}`) : undefined;
  }

  return read("HTTPS") ?? read("HTTP");
}

/** 从 reg query 输出中读取指定注册表值。 */
function regValue(output: string, key: string): string | undefined {
  return output.match(new RegExp(`^\\s*${key}\\s+REG_[A-Z_]+\\s+(.+?)\\s*$`, "mi"))?.[1];
}

/** 解析 Windows 当前用户的固定系统代理。 */
export function parseWindowsProxy(output: string): string | undefined {
  const enabled = Number.parseInt(regValue(output, "ProxyEnable") ?? "0", 0) === 1;
  const server = regValue(output, "ProxyServer")?.trim();
  if (!enabled || !server) {
    return undefined;
  }

  if (!server.includes("=")) {
    return proxyUrl(server);
  }

  const endpoints = new Map<string, string>();
  for (const item of server.split(";")) {
    const [name, value] = item.split("=", 2);
    if (name && value) {
      endpoints.set(name.trim().toLowerCase(), value.trim());
    }
  }
  return proxyUrl(endpoints.get("https")) ?? proxyUrl(endpoints.get("http"));
}

/** 按当前操作系统读取固定系统代理，读取失败时返回直连。 */
export async function systemProxy(platform = process.platform): Promise<string | undefined> {
  try {
    if (platform === "darwin") {
      const result = await exec("/usr/sbin/scutil", ["--proxy"]);
      return parseMacProxy(result.stdout);
    }
    if (platform === "win32") {
      const result = await exec("reg.exe", ["query", winKey]);
      return parseWindowsProxy(result.stdout);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
