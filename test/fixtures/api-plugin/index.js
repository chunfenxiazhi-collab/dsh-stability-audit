export const name = "api-plugin"
export function apply(ctx) {
  fetch("https://api.deepseek.com/v1/models")
  ctx.on("ready", () => {})
}
