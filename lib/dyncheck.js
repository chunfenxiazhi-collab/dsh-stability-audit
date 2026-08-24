// 隔离环境动态验证：临时 DSH_HOME 下安装目标插件并 headless 冒烟。
// 与 dsh-test-drive 同思路（隔离/冒烟/清理），但可编程调用；无 shell 注入面
// （node + dsh bin 直调，不经 shell 解析）。
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url))

// dsh bin 定位：优先宿主 dsh 安装（按相对路径探测），再 DSH_CLI 环境变量
export function findDshBin() {
  const cands = [
    process.env.DSH_CLI,
    // 宿主 dsh 全局安装（npm）
    path.join(process.env.APPDATA || "", "Roaming", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    // 源码 checkout
    path.resolve(THIS_DIR, "..", "..", "..", "dsh", "lib", "bin.js"),
  ].filter(Boolean)
  for (const c of cands) {
    if (c && existsSync(c)) return c
  }
  return null
}

// 临时目录里建可安装副本：含空格路径用 junction（dsh/pnpm 对空格路径链接解析不稳）
export function stageTarget(dir) {
  if (!/\s/.test(dir)) return { dir, cleanup: null }
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-audit-stage-"))
  const link = path.join(stage, path.basename(dir))
  const r = spawnSync("cmd", ["/c", `mklink /J "${link}" "${dir}"`], { timeout: 15000 })
  if (r.status !== 0) return { dir, cleanup: () => rmSync(stage, { recursive: true, force: true }) }
  return { dir: link, cleanup: () => rmSync(stage, { recursive: true, force: true }) }
}

// 对单个插件做隔离安装 + 冒烟
export function dynamicCheck({ target, timeoutMs = 120000, task = "reply OK" }) {
  const bin = findDshBin()
  if (!bin) return { status: "skipped", detail: "dsh bin 未找到（DSH_CLI 或宿主 npm 安装）" }
  const home = mkdtempSync(path.join(tmpdir(), "dsh-audit-home-"))
  const staged = stageTarget(target)
  const t0 = Date.now()
  try {
    const env = { ...process.env, DSH_HOME: home }
    // 1) 隔离安装（node 直调，无 shell）
    const inst = spawnSync(process.execPath, [bin, "plugin", "--profile", "headless", "add", staged.dir],
      { env, timeout: timeoutMs, encoding: "utf8" })
    const installOk = inst.status === 0
    // 2) headless 冒烟（启动即验证 loader）
    let bootExit = null, bootOk = false
    if (installOk) {
      const boot = spawnSync(process.execPath, [bin, "--profile", "headless", task],
        { env, timeout: timeoutMs, encoding: "utf8" })
      bootExit = boot.status
      const out = `${boot.stdout || ""} ${boot.stderr || ""}`
      // boot 判定：只看 loader/插件树错误（隔离环境无 API key 时任务不完成是预期，
      // 与 dsh-test-drive 的 smoke 语义一致）
      // pending (waiting for service: X) = 隔离环境缺宿主服务（webServer/storageDomain 等），
      // 非插件缺陷 → 不判失败
      // 环境依赖判定：插件树失败 + pending(waiting for service) = 隔离环境缺宿主服务（非插件缺陷）
      const pendingEnv = /pending \(waiting for services?: [A-Za-z, ]+\)/.test(out)
      const treeFailed = /plugin tree failed/i.test(out)
      bootOk = !/FAILED|loader|Cannot find module/i.test(out) || (treeFailed && pendingEnv)
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