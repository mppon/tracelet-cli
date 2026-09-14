/** 本文件验证 Tracelet 用户配置的默认值和代理模式持久化。 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSettings, saveProxy } from "../apps/cli/src/settings.js";

describe("Tracelet settings", () => {
  /** 验证配置文件不存在时默认使用直连。 */
  it("defaults to direct", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    expect((await loadSettings(join(root, "settings.json"))).proxy.mode).toBe("direct");
  });

  /** 验证保存代理模式时保留已有的其他配置。 */
  it("saves system proxy mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-settings-"));
    const path = join(root, "settings.json");
    await writeFile(path, JSON.stringify({ extra: true }), "utf8");

    await saveProxy("system", path);

    expect((await loadSettings(path)).proxy.mode).toBe("system");
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      extra: true,
      proxy: { mode: "system" },
    });
  });
});
