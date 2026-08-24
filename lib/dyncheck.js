// 隔离环境动态验证：临时 DSH_HOME 下安装目标插件并 headless 冒烟。
// 与 dsh-test-drive 同思路（隔离/冒烟/清理），但可编程调用（spawn 独立 dsh 进程），
// 不依赖 test-drive 包；对含空格路径自动做 junction 规避（test-drive 已知限制）。
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// dsh CLI 定位（Windows npm global / PATH）
export function findDshCli() {
  const cands = [
    process.env.DSH_CLI,
    path.join(process.env.APPDATA || "", "npm", "dsh.cmd"),
    "dsh",
  ].filter(Boolean)
  for (const c of cands) {
    try {
      const r = spawnSync(c, ["--version"], { shell: true, timeout: 15000 })
      if (r.status === 0) return c
    } catch { /* next */ }
  }
  return null
}

// 临时目录里建可安装副本：含空格路径用 junction（dsh/pnpm 对空格路径链接解析不稳）
function stageTarget(dir) {
  if (!/\s/.test(dir)) return { dir, cleanup: null }
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-audit-stage-"))
  const link = path.join(stage, path.basename(dir))
  // Windows: junction 需要目标存在；用 mklink /J
  const r = spawnSync("cmd", ["/c", `mklink /J "${link}" "${dir}"`], { timeout: 15000 })
  if (r.status !== 0) return { dir, cleanup: () => rmSync(stage, { recursive: true, force: true }) }
  return { dir: link, cleanup: () => rmSync(stage, { recursive: true, force: true }) }
}

// 对单个插件做隔离安装 + 冒烟
// returns { status: "pass"|"fail"|"skipped", detail, installExit, bootExit, durationMs }
export function dynamicCheck({ target, timeoutMs = 120000, task = "reply OK" }) {
  const cli = findDshCli()
  if (!cli) return { status: "skipped", detail: "dsh CLI 未找到（DSH_CLI/APPDATA npm/dsh.cmd）" }
  const home = mkdtempSync(path.join(tmpdir(), "dsh-audit-home-"))
  const staged = stageTarget(target)
  const t0 = Date.now()
  try {
    const env = { ...process.env, DSH_HOME: home }
    // 1) 隔离安装
    const inst = spawnSync(cli, ["plugin", "--profile", "headless", "add", staged.dir],
      { env, shell: true, timeout: timeoutMs, encoding: "utf8" })
    const installOk = inst.status === 0
    // 2) headless 冒烟（启动即验证 loader）
    let bootExit = null, bootOk = false
    if (installOk) {
      const boot = spawnSync(cli, ["--profile", "headless", task],
        { env, shell: true, timeout: timeoutMs, encoding: "utf8" })
      bootExit = boot.status
      const out = `${boot.stdout || ""} ${boot.stderr || ""}`
      // boot 判定：只看 loader/插件树错误（隔离环境无 API key 时任务不完成是预期，
      // 与 dsh-test-drive 的 smoke 语义一致）；
      // headless 任务正常完成（含 CAPABILITY_DONE/reply ok）视为更强证据
      bootOk = !/FAILED|loader|plugin tree failed|Cannot find module/i.test(out)
    }
    return {
      status: installOk && bootOk ? "pass" : "fail",
      detail: installOk ? (bootOk ? "隔离安装通过 + 无 loader 错误（headless 任务需真实凭据）" : `安装 ok 但 boot 异常(exit ${bootExit})`)
        : `隔离安装失败(exit ${inst.status}): ${(inst.stderr || "").slice(0, 120)}`,
      installExit: inst.status ?? null, bootExit,
      durationMs: Date.now() - t0,
    }
  } catch (e) {
    return { status: "fail", detail: `动态验证异常: ${e.message.slice(0, 120)}`, durationMs: Date.now() - t0 }
  } finally {
    rmSync(home, { recursive: true, force: true })
    staged.cleanup?.()
  }
}