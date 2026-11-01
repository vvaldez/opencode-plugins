import { describe, expect, test } from "bun:test"
import {
  BUDGET,
  DIALOG_BUDGET,
  EMPTY,
  MAX_ITEMS,
  MAX_SESSION_ITEMS,
  addItem,
  fromFile,
  fromOptions,
  headerLine,
  itemLine,
  itemsFor,
  openCount,
  removeItem,
  toggleItem,
  truncate,
  visibleItems,
  type TodoFile,
  type TodoItem,
} from "../lib.ts"

function item(partial: Partial<TodoItem>): TodoItem {
  return { id: "x", text: "t", done: false, created: 0, ...partial }
}

describe("fromFile", () => {
  test("undefined and null fall back to empty", () => {
    expect(fromFile(undefined)).toEqual(EMPTY)
    expect(fromFile(null)).toEqual(EMPTY)
    expect(fromFile("garbage")).toEqual(EMPTY)
    expect(fromFile(42)).toEqual(EMPTY)
  })

  test("a hostile object cannot smuggle values through", () => {
    const file = fromFile({
      sessions: {
        ses_a: [{ id: "ok", text: "real", done: false, created: 1 }],
        ses_b: [{ id: "", text: "no id" }, { text: "no id key" }, "junk", null],
        "": [{ id: "k", text: "empty session key", done: false, created: 1 }],
      },
      extra: "dropped",
    })
    expect(itemsFor(file, "ses_a")).toHaveLength(1)
    expect(itemsFor(file, "ses_b")).toHaveLength(0)
    expect(itemsFor(file, "")).toHaveLength(0)
    expect((file as Record<string, unknown>).extra).toBeUndefined()
  })

  test("a missing created timestamp reads as 0", () => {
    const file = fromFile({ sessions: { ses_a: [{ id: "a", text: "t", done: false }] } })
    expect(itemsFor(file, "ses_a")[0].created).toBe(0)
  })

  test("done and open counts round-trip", () => {
    const file = fromFile({
      sessions: {
        ses_a: [
          { id: "a", text: "one", done: false, created: 1 },
          { id: "b", text: "two", done: true, created: 2 },
        ],
      },
    })
    expect(itemsFor(file, "ses_a")).toHaveLength(2)
    expect(openCount(itemsFor(file, "ses_a"))).toBe(1)
  })

  test("prototype-hazard session keys never become own properties", () => {
    const file = fromFile({
      sessions: {
        __proto__: [{ id: "a", text: "p", done: false, created: 1 }],
        constructor: [{ id: "b", text: "c", done: false, created: 1 }],
        ses_ok: [{ id: "c", text: "ok", done: false, created: 1 }],
      },
    })
    expect(itemsFor(file, "__proto__" as string)).toHaveLength(0)
    expect(itemsFor(file, "constructor" as string)).toHaveLength(0)
    expect(itemsFor(file, "ses_ok")).toHaveLength(1)
  })

  test("items past the per-session cap are dropped on read", () => {
    const many = Array.from({ length: MAX_SESSION_ITEMS + 10 }, (_, i) => ({
      id: `i${i}`,
      text: "t",
      done: false,
      created: i,
    }))
    const file = fromFile({ sessions: { ses_a: many } })
    expect(itemsFor(file, "ses_a")).toHaveLength(MAX_SESSION_ITEMS)
  })
})

describe("mutators", () => {
  test("addItem trims and rejects empty text", () => {
    const items = addItem([], "  fix the thing  ")
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe("fix the thing")
    expect(addItem(items, "   ")).toHaveLength(1)
    expect(addItem(items, "")).toHaveLength(1)
  })

  test("addItem appends with done false and the injected timestamp", () => {
    const items = addItem([], "one", 100)
    expect(items[0].done).toBe(false)
    expect(items[0].created).toBe(100)
    const again = addItem(items, "two", 100)
    expect(again[0].id.startsWith("todo-")).toBe(true)
    expect(again[1].id).not.toBe(again[0].id)
  })

  test("toggleItem flips only the matching item", () => {
    const items = [item({ id: "a" }), item({ id: "b" })]
    const toggled = toggleItem(items, "a")
    expect(toggled[0].done).toBe(true)
    expect(toggled[1].done).toBe(false)
    expect(toggleItem(toggled, "a")[0].done).toBe(false)
  })

  test("removeItem drops only the matching item", () => {
    const items = [item({ id: "a" }), item({ id: "b" })]
    expect(removeItem(items, "a")).toHaveLength(1)
    expect(removeItem(items, "zzz")).toHaveLength(2)
  })
})

describe("rendering", () => {
  test("headerLine counts open items", () => {
    expect(headerLine([])).toBe("todos: none")
    expect(headerLine([item({ id: "a" }), item({ id: "b", done: true })])).toBe("todos: 1 open")
    expect(headerLine([item({ id: "a", done: true })])).toBe("todos: all done")
  })

  test("itemLine prefixes the glyph and honors the budget", () => {
    expect(itemLine(item({ text: "short" }))).toBe("☐ short")
    expect(itemLine(item({ text: "short", done: true }))).toBe("☑ short")
    const long = item({ text: "x".repeat(50) })
    const line = itemLine(long)
    expect(line.startsWith("☐ ")).toBe(true)
    expect(line.length).toBe(2 + BUDGET)
    expect(line.endsWith("…")).toBe(true)
  })

  test("bullet style keeps the round glyphs", () => {
    expect(itemLine(item({ text: "short" }), "bullet")).toBe("• short")
    expect(itemLine(item({ text: "short", done: true }), "bullet")).toBe("✓ short")
    const line = itemLine(item({ text: "x".repeat(50) }), "bullet")
    expect(line.startsWith("• ")).toBe(true)
    expect(line.length).toBe(2 + BUDGET)
  })

  test("truncate keeps the head and adds an ellipsis", () => {
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("x".repeat(40), 38)).toHaveLength(38)
  })

  test("visibleItems shows open items first, then done, capped", () => {
    const items = [
      item({ id: "1" }),
      item({ id: "2", done: true }),
      item({ id: "3" }),
      item({ id: "4", done: true }),
    ]
    // open items in list order, then done items newest first
    expect(visibleItems(items).map((i) => i.id)).toEqual(["1", "3", "4", "2"])
  })

  test("done items fill only the leftover cap space", () => {
    const items = [
      item({ id: "d1", done: true }),
      item({ id: "o1" }),
      item({ id: "d2", done: true }),
      item({ id: "o2" }),
      item({ id: "o3" }),
      item({ id: "o4" }),
      item({ id: "o5" }),
      item({ id: "o6" }),
    ]
    // six open items fill the whole shared cap; the done ones drop out
    // entirely rather than crowding an open row
    const visible = visibleItems(items)
    expect(visible.map((i) => i.id)).toEqual(["o1", "o2", "o3", "o4", "o5", "o6"])
    expect(visible).toHaveLength(MAX_ITEMS)
    const mixed = [
      item({ id: "d1", done: true }),
      item({ id: "o1" }),
      item({ id: "d2", done: true }),
      item({ id: "o2" }),
      item({ id: "o3" }),
    ]
    // two open + three done: all fit, done newest first after the open
    expect(visibleItems(mixed).map((i) => i.id)).toEqual(["o1", "o2", "o3", "d2", "d1"])
  })

  test("all done and empty inputs behave correctly", () => {
    expect(visibleItems([])).toEqual([])
    const done = [
      item({ id: "d1", done: true }),
      item({ id: "d2", done: true }),
    ]
    // all done: newest first
    expect(visibleItems(done).map((i) => i.id)).toEqual(["d2", "d1"])
    const many = Array.from({ length: 10 }, (_, i) => item({ id: String(i) }))
    expect(visibleItems(many)).toHaveLength(MAX_ITEMS)
  })
})

describe("itemsFor", () => {
  test("an unknown session reads as empty", () => {
    const file: TodoFile = { sessions: { ses_a: [item({ id: "a" })] } }
    expect(itemsFor(file, "ses_a")).toHaveLength(1)
    expect(itemsFor(file, "ses_zzz")).toHaveLength(0)
  })
})

describe("fromOptions", () => {
  test("undefined, null, and junk fall back to the checkbox default", () => {
    expect(fromOptions(undefined)).toEqual({ style: "checkbox" })
    expect(fromOptions(null)).toEqual({ style: "checkbox" })
    expect(fromOptions("garbage")).toEqual({ style: "checkbox" })
    expect(fromOptions({ style: "evil" })).toEqual({ style: "checkbox" })
  })

  test("bullet is honored", () => {
    expect(fromOptions({ style: "bullet" })).toEqual({ style: "bullet" })
  })

  test("unknown keys are dropped", () => {
    const cfg = fromOptions({ style: "checkbox", extra: "dropped" })
    expect(cfg).toEqual({ style: "checkbox" })
    expect((cfg as Record<string, unknown>).extra).toBeUndefined()
  })
})
