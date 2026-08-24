import { readdirSync } from "node:fs"
export function apply(ctx) {
  const files = readdirSync("/")   // 启动扫描
  setInterval(() => {}, 1000)
  ctx.on("ready", () => {})
}
