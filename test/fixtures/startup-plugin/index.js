import { readdirSync } from "node:fs"
// 顶层同步扫描（启动即阻塞）——真实 codegraph bootstrap 形态
const ALL_FILES = readdirSync("/")
export function apply(ctx) {
  ctx.on("ready", () => {})
}