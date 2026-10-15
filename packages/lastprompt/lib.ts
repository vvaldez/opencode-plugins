// lastprompt: pure helpers for the last-prompt sidebar row.
//
// Trust boundary: opencode.json options are display-only. A hostile
// project config can at most flip the surface to off or widen the row
// to two lines. There is no command, fetch, or file surface here.

export type Surface = "sidebar" | "off"
export type Lines = 1 | 2

export type LastPromptConfig = {
  surface: Surface
  lines: Lines
}

export const DEFAULTS: LastPromptConfig = { surface: "sidebar", lines: 1 }

// Allow-list read of a foreign shape: anything that is not exactly a
// known value falls back to the default. No keys are passed through.
export function fromOptions(raw: unknown): LastPromptConfig {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    surface: o.surface === "off" ? "off" : "sidebar",
    lines: o.lines === 2 ? 2 : 1,
  }
}

// The last user message's text, walking the transcript from the end.
// Non-user rows (assistant, system, shell, compaction) are skipped, and
// a user row with empty text does not satisfy the demand.
export function lastUserText(messages: Array<{ type?: unknown; text?: unknown }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.type !== "user") continue
    if (typeof m.text === "string" && m.text.trim().length > 0) return m.text
  }
  return undefined
}

// Whitespace to single spaces: a prompt that spans paragraphs reads as
// one line in the row.
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

// The row budget in characters. The host fixes the session sidebar at
// 42 columns (SESSION_SIDEBAR_WIDTH, packages/tui/src/ui/layout.ts) and
// wraps the row at that width, so the budget is the width minus the
// "last " prefix and a margin: 36 for one line, 72 for two.
// Truncation keeps the head and adds an ellipsis.
const BUDGET: Record<Lines, number> = { 1: 36, 2: 72 }

export function renderLine(text: string, lines: Lines): string {
  const one = collapse(text)
  const budget = BUDGET[lines]
  if (one.length <= budget) return one
  return one.slice(0, budget - 1) + "…"
}
