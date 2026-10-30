// question-sanitize — OpenCode V2 plugin (server part).
// Plain object export with NO imports: an import that fails to resolve makes a
// local directory plugin silently never load.
//
// The structured `question` tool renders one word per line when its payload
// carries literal \r (carriage-return) characters — a payload built with \r
// escape sequences renders vertically and is unreadable, and repeated
// dismissals strand the interaction. This plugin registers a tool
// execute.before hook that strips every \r from the question tool's input
// (headers, questions, labels, descriptions, options) before execution, so a
// malformed payload renders as plain text instead of breaking the prompt.
//
// Scoped to the question tool on purpose: other tools may legitimately carry
// \r (a write tool writing CRLF content, for example) and must not be touched.

export function scrub(value) {
  if (typeof value === "string") {
    return value.replaceAll("\r", "")
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i])
    return value
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = scrub(value[key])
    return value
  }
  return value
}

export function countStr(value) {
  if (typeof value === "string") {
    return (value.match(/\r/g) ?? []).length
  }
  if (Array.isArray(value)) {
    let total = 0
    for (const item of value) total += countStr(item)
    return total
  }
  if (value !== null && typeof value === "object") {
    let total = 0
    for (const key of Object.keys(value)) total += countStr(value[key])
    return total
  }
  return 0
}

export default {
  id: "question-sanitize",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool !== "question") return
      const input = event.input
      if (input === null || typeof input !== "object") return
      const removed = countStr(input)
      if (removed === 0) return
      scrub(input)
      console.log(
        `question-sanitize: stripped ${removed} carriage return(s) from the question payload`,
      )
    })
  },
}
