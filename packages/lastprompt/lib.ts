// lastprompt: pure helpers for the last-prompt sidebar row.
//
// Trust boundary: opencode.json options are display-only. A hostile
// project config can at most flip the surface to off or clamp the row
// height into 1..MAX_LINES. There is no command, fetch, or file
// surface here.

export type Surface = "sidebar" | "off"

// The row height in sidebar lines, 1..MAX_LINES. Five is the default:
// the host wraps at the fixed 42-column sidebar width, so five lines
// hold ~180 collapsed characters without crowding the built-in rows.
export const MAX_LINES = 10
export type Lines = number

export type LastPromptConfig = {
  surface: Surface
  lines: Lines
}

export const DEFAULTS: LastPromptConfig = { surface: "sidebar", lines: 5 }

// A hostile or stale value falls back to the default; a real number is
// clamped into range (validate-on-read, fail-closed).
function clampLines(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return DEFAULTS.lines
  if (raw < 1) return 1
  if (raw > MAX_LINES) return MAX_LINES
  return raw
}

// Allow-list read of a foreign shape: anything that is not exactly a
// known value falls back to the default. No keys are passed through.
export function fromOptions(raw: unknown): LastPromptConfig {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    surface: o.surface === "off" ? "off" : "sidebar",
    lines: clampLines(o.lines),
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
// wraps the row at that width, so the budget is the per-line width
// minus the "last " prefix and a margin, times the line count: 36 per
// line. Truncation keeps the head and adds an ellipsis.
const PER_LINE_BUDGET = 36

export function renderLine(text: string, lines: Lines): string {
  const one = collapse(text)
  const budget = lines * PER_LINE_BUDGET
  if (one.length <= budget) return one
  return one.slice(0, budget - 1) + "…"
}
