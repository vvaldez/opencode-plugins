import { describe, expect, test } from "bun:test"
import {
  BUDGET,
  EMPTY,
  MAX_ITEMS,
  addItem,
  fromFile,
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
    expect(headerLine([])).toBe("todos: 0 open")
    expect(headerLine([item({ id: "a" }), item({ id: "b", done: true })])).toBe("todos: 1 open")
    expect(headerLine([item({ id: "a", done: true })])).toBe("todos: all done")
  })

  test("itemLine prefixes the glyph and honors the budget", () => {
    expect(itemLine(item({ text: "short" }))).toBe("• short")
    expect(itemLine(item({ text: "short", done: true }))).toBe("✓ short")
    const long = item({ text: "x".repeat(50) })
    const line = itemLine(long)
    expect(line.startsWith("• ")).toBe(true)
    expect(line.length).toBe(2 + BUDGET)
    expect(line.endsWith("…")).toBe(true)
  })

  test("truncate keeps the head and adds an ellipsis", () => {
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("x".repeat(40), 38)).toHaveLength(38)
  })

  test("visibleItems shows open items only, capped", () => {
    const items = [
      item({ id: "1" }),
      item({ id: "2", done: true }),
      item({ id: "3" }),
      item({ id: "4", done: true }),
    ]
    expect(visibleItems(items).map((i) => i.id)).toEqual(["1", "3"])
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
