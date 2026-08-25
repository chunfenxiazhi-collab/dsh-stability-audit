import { z } from "schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
export const name = "missing-dep-plugin"
export function apply(ctx) {
  ctx.on("ready", () => { console.log(z) })
}
