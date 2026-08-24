export const name = "deferred-inject-plugin"
export function apply(ctx) {
  ctx.on("ready", async () => {
    const s = await ctx.skills.get("demo", {})
    console.log(s)
  })
}
