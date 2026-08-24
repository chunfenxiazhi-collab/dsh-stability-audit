import { defineTool } from "@deepseek-ai/dsh-tools"
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"
import { collectPlugins } from "./lib/collect.js"

export const name = "dsh-stability-audit"
export const inject = ["tools"]

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "stability_audit",
    description: "扫描已安装插件的稳定性风险（静态判级：钩子面/启动任务/事件监听/打包/依赖/预检），可选隔离环境动态验证，输出分级 Markdown 报告。",
    parameters: {
      dynamic: { type: "boolean", default: false, description: "对全部插件跑隔离安装验证（临时 DSH_HOME，约 2s/插件，27 个约 1 分钟）" },
      profile: { type: "string", default: "web", description: "要审计的 profile 名" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args) {
      const { plugins, preflight } = collectPlugins(undefined, args.profile || "web")
      const audit = await auditProfile({ plugins, preflight, dynamic: !!args.dynamic })
      return renderReport(audit)
    },
  }))
}