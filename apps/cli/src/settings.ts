/** 本文件负责读取和保存用户目录中的 Tracelet 配置。 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { settingsFile } from "./paths.js";

export type ProxyMode = "direct" | "system";

export interface Settings {
  proxy: {
    mode: ProxyMode;
  };
}

/** 判断配置值是否为普通对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 读取原始配置对象，文件不存在时返回空配置。 */
async function readRaw(path: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isObject(value)) {
      throw new Error("Settings root must be an object");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {};
    }
    throw new Error(`Failed to read Tracelet settings: ${path}`, { cause: error });
  }
}

/** 读取并校验 Tracelet 配置，缺省时使用直连。 */
export async function loadSettings(path = settingsFile()): Promise<Settings> {
  const value = await readRaw(path);
  const proxy = value.proxy;
  if (proxy !== undefined && !isObject(proxy)) {
    throw new Error(`Invalid proxy settings: ${path}`);
  }

  const mode = isObject(proxy) ? proxy.mode : undefined;
  if (mode !== undefined && mode !== "direct" && mode !== "system") {
    throw new Error(`Invalid proxy mode: ${String(mode)}`);
  }

  return { proxy: { mode: mode ?? "direct" } };
}

/** 保存代理模式，同时保留配置文件中的其他字段。 */
export async function saveProxy(mode: ProxyMode, path = settingsFile()): Promise<void> {
  const value = await readRaw(path);
  const proxy = isObject(value.proxy) ? value.proxy : {};
  const next = { ...value, proxy: { ...proxy, mode } };

  // settings.json 独立于记录目录，始终保存在当前用户的 Tracelet 目录下。
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
