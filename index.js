// 入口：注册 stability_audit 工具。
// 零 harness 依赖：不 import @deepseek-ai/*（避免 pnpm 安装时解析 dsh-tools
// 覆盖 profile 的 junction，导致工具层单实例破坏——见 dsh-troubleshooting-2 §3）。
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"
import { collectPlugins } from "./lib/collect.js"
import { persistReport, summaryLine } from "./lib/report-store.js"

export const name = "dsh-stability-audit"
export const inject = ["tools"]

// 工具对象直接注册（等效 defineTool 的简单参数情形：boolean/string 即标准 JSON Schema）
export function apply(ctx) {
  ctx.tools.register({
    name: "stability_audit",
    description: "扫描已安装插件的稳定性风险（静态判级：钩子面/启动任务/事件监听/打包/依赖/预检），可选隔离环境动态验证，输出分级 Markdown 报告；结果自动落盘 ~/.dsh/stability-report.json。",
    parameters: {
      type: "object",
      properties: {
        dynamic: { type: "boolean", default: false, description: "对全部插件跑隔离安装验证（临时 DSH_HOME，约 2s/插件，27 个约 1 分钟）" },
        profile: { type: "string", default: "web", description: "要审计的 profile 名" },
        focus: { type: "boolean", default: false, description: "只看红/黄（省略绿插件），减少噪音" },
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args) {
      const { plugins, preflight } = collectPlugins(undefined, args.profile || "web")
      const audit = await auditProfile({ plugins, preflight, dynamic: !!args.dynamic })
      // C: 报告落盘 + 状态变化检测（行业经验：只在变化时提示，避免 alert fatigue）
      const stored = persistReport(audit)
      // focus: 只看红黄
      if (args.focus) {
        audit.plugins = audit.plugins.filter(p => p.grade !== "green")
        audit.summary = {
          red: audit.plugins.filter(p => p.grade === "red").length,
          yellow: audit.plugins.filter(p => p.grade === "yellow").length,
          green: 0,
        }
      }
      const lines = [summaryLine(audit)]
      // A: 状态变化提示（新增/变化/消失的红黄）
      if (stored.changed) {
        const d = stored.diff
        const notes = [...d.added, ...d.changed, ...d.removed]
        if (notes.length) lines.push("⚠️ 插件状态变化: " + notes.join("；"))
      }
      lines.push("")
      lines.push(renderReport(audit))
      return lines.join("\n")
    },
  })
}
