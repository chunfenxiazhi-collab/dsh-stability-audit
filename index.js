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
  // 启动时自动扫描（行业经验：被动扫描 + 变化才打扰）。
  // 不阻塞启动、失败静默、不弹窗——只让报告保持新鲜，下次调用时变化提示准确。
  // 定时触发：利用 dsh 启动时机；零依赖实现。
  scheduleAutoScan()

  ctx.tools.register({
    name: "stability_audit",
    description: "Scan installed plugins for stability risks (static grading: hook surface / startup work / event listeners / packaging / deps / preflight), optional isolated dynamic verification, graded Markdown report; results persist to ~/.dsh/stability-report.json.",
    parameters: {
      type: "object",
      properties: {
        dynamic: { type: "boolean", default: false, description: "Run isolated install verification for all plugins (temp DSH_HOME, ~2s/plugin, 27 plugins ~1min)" },
        profile: { type: "string", default: "web", description: "Profile name to audit" },
        focus: { type: "boolean", default: false, description: "Show only red/yellow (omit green plugins) to reduce noise" },
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
        if (notes.length) lines.push("⚠️ Plugin state changes: " + notes.join("; "))
      }
      lines.push("")
      lines.push(renderReport(audit))
      return lines.join("\n")
    },
  })
}

// 启动时异步跑一次静态审计（秒级），仅落盘 + 更新变化基线，不产生任何输出/通知。
// 安全：try/catch 全包裹，审计失败绝不影响 dsh 启动。
function scheduleAutoScan() {
  // 延迟到 apply 完成后执行（让 dsh 先完成启动）
  setTimeout(() => {
    ;(async () => {
      try {
        const { plugins, preflight } = collectPlugins()
        const audit = await auditProfile({ plugins, preflight, dynamic: false })
        persistReport(audit) // 变化检测自动更新基线
      } catch {
        // 静默：审计失败不影响 dsh
      }
    })()
  }, 3000)
}