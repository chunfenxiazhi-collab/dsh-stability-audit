import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
const w = "C:/学习资料/DEEPSEEK HARNESS/dsh-stability-audit"
const lines = ["feat: per-finding fix suggestions + --json machine-readable output", "", "Every finding now carries a fix field (executable command or manual action) so user agents scanning the harness can quickly surface problems and remedies. New --json flag emits structured output (schema dsh-stability-audit/v1) with ruleId/severity/evidence/fix per finding; markdown report shows a wrench line per finding. Bump to 0.8.0.", ""]
writeFileSync(w + "/tmp-msg.txt", lines.join("\n"))
execFileSync("git", ["-C", w, "add", "-A"])
execFileSync("git", ["-C", w, "-c", "user.name=chunfenxiazhi", "-c", "user.email=chunfenxiazhi@users.noreply.github.com", "commit", "-F", w + "/tmp-msg.txt"], { encoding: "utf8" })
console.log(execFileSync("git", ["-C", w, "log", "--oneline", "-1"], { encoding: "utf8" }))