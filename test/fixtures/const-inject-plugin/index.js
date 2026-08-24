export const name = "const-inject-plugin"
const inject = ["tools", "commands"]
export function apply(ctx) {
  ctx.tools.register({ name: "demo", apply: () => "ok" })
  ctx.commands.register({ name: "/demo", apply: () => "ok" })
}
