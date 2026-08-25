import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
const w = "C:/学习资料/DEEPSEEK HARNESS/dsh-stability-audit"
const lines = ["docs: bring READMEs up to date with v0.8", "", "Add npm install option, --json usage, remote --dynamic examples, fix-suggestion note, release channels, and the failure-mode lessons (dsh-tools single instance, session pollution). Both zh and en rewritten in sync.", ""]
writeFileSync(w + "/tmp-msg.txt", lines.join("\n"))
execFileSync("git", ["-C", w, "add", "-A"])
execFileSync("git", ["-C", w, "-c", "user.name=chunfenxiazhi", "-c", "user.email=chunfenxiazhi@users.noreply.github.com", "commit", "-F", w + "/tmp-msg.txt"], { encoding: "utf8" })
console.log(execFileSync("git", ["-C", w, "log", "--oneline", "-1"], { encoding: "utf8" }))