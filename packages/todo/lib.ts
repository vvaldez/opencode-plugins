// todo: pure helpers for the per-session sidebar todo list.
//
// Trust boundary: the plugin reads one user-owned file
// (~/.config/opencode/todos.json). A hostile or stale file shape falls
// back to empty on read; item text is rendered as-is and never
// executed. No network, no shell, no agent tools registered.

export type TodoItem = {
  id: string
  text: string
  done: boolean
  created: number
}

export type TodoFile = {
  sessions: Record<string, TodoItem[]>
}

export const EMPTY: TodoFile = { sessions: {} }

// The text budget in characters. The host fixes the session sidebar at
// 42 columns (SESSION_SIDEBAR_WIDTH, packages/tui/src/ui/layout.ts) and
// wraps the block at that width, so the budget is the width minus the
// two-character glyph prefix and a margin: a one-line item stays one
// line.
export const BUDGET = 38

// Rows shown in the sidebar. One truncated line each respects the
// #28035 space lesson; installing the plugin is the opt-in.
export const MAX_ITEMS = 6

// The dialog's item text budget: the dialog is wider than the sidebar,
// so long item text still truncates.
export const DIALOG_BUDGET = 60

// Per-session item cap on read. A hostile or buggy writer can produce
// arbitrarily many items; the read drops everything past the cap
// (validate-on-read, fail-closed).
export const MAX_SESSION_ITEMS = 200

let counter = 0
export function newId(now = Date.now()): string {
  counter += 1
  return `todo-${now.toString(36)}-${counter}`
}

// Allow-list read of a foreign shape: anything that is not a known
// value falls back to empty. No unknown keys pass through. An item
// needs a non-empty string id, string text, and boolean done; a
// missing created timestamp reads as 0.
export function fromFile(raw: unknown): TodoFile {
  const o = (raw ?? {}) as Record<string, unknown>
  const sessions: Record<string, TodoItem[]> = {}
  const rawSessions = (o.sessions ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(rawSessions)) {
    if (typeof key !== "string" || key.length === 0) continue
    // prototype-hazard keys: the assignment below must create an own
    // property, never invoke a prototype setter
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue
    if (!Array.isArray(value)) continue
    const list: TodoItem[] = []
    for (const entry of value) {
      if (list.length >= MAX_SESSION_ITEMS) break
      const e = (entry ?? {}) as Record<string, unknown>
      if (typeof e.id !== "string" || e.id.length === 0) continue
      if (typeof e.text !== "string") continue
      if (typeof e.done !== "boolean") continue
      list.push({
        id: e.id,
        text: e.text,
        done: e.done,
        created: typeof e.created === "number" ? e.created : 0,
      })
    }
    sessions[key] = list
  }
  return { sessions }
}

export function itemsFor(file: TodoFile, sessionID: string): TodoItem[] {
  // own properties only: a prototype-hazard key ("__proto__") reads
  // the prototype object, not undefined
  const list = Object.hasOwn(file.sessions, sessionID) ? file.sessions[sessionID] : undefined
  return list ?? []
}

export function openCount(items: TodoItem[]): number {
  return items.filter((item) => !item.done).length
}

// Mutators return new arrays; the caller owns the write. Empty or
// whitespace-only text is a no-op.
export function addItem(items: TodoItem[], text: string, now = Date.now()): TodoItem[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return items
  return [...items, { id: newId(now), text: trimmed, done: false, created: now }]
}

export function toggleItem(items: TodoItem[], id: string): TodoItem[] {
  return items.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
}

export function removeItem(items: TodoItem[], id: string): TodoItem[] {
  return items.filter((item) => item.id !== id)
}

// The sidebar shows the session's open items, capped. Done items stay
// reachable through the /todo dialog; the header count drops when an
// item is toggled.
export function visibleItems(items: TodoItem[], max = MAX_ITEMS): TodoItem[] {
  return items.filter((item) => !item.done).slice(0, max)
}

export function headerLine(items: TodoItem[]): string {
  const open = openCount(items)
  if (items.length === 0) return "todos: none"
  if (open === 0) return "todos: all done"
  return `todos: ${open} open`
}

export function itemLine(item: TodoItem, budget = BUDGET): string {
  const glyph = item.done ? "✓" : "•"
  return `${glyph} ${truncate(item.text, budget)}`
}

export function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text
  return `${text.slice(0, budget - 1)}…`
}
