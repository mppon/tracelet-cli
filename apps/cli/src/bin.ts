/** 本文件是 Tracelet CLI 的程序入口。 */

import { createProgram } from "./program.js";

/** 解析命令行并统一输出可读错误。 */
async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
