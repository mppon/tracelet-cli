/** 本文件验证清理功能只删除 Tracelet 运行记录。 */

import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearData } from "../apps/cli/src/clear.js";

/** 定义清理功能的行为测试。 */
describe("clearData", () => {
  /** 验证运行记录被清空，而数据目录中的其他文件被保留。 */
  it("只清除 runs 目录中的记录", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracelet-clear-"));
    const run = join(root, "runs", "2026-09-13", "run_test");
    await mkdir(run, { recursive: true });
    await writeFile(join(run, "run.json"), "{}", "utf8");
    await writeFile(join(root, "keep.txt"), "keep", "utf8");

    await clearData(root);

    expect(await readdir(join(root, "runs"))).toEqual([]);
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
  });
});
