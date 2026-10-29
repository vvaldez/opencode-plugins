import { describe, expect, test } from "bun:test"
import { DEFAULTS, collapse, fromOptions, lastUserText, renderLine } from "../lib.ts"

describe("lastUserText", () => {
  test("returns the last user message's text", () => {
    const messages = [
      { type: "user", text: "first prompt" },
      { type: "assistant", text: "a reply" },
      { type: "user", text: "second prompt" },
      { type: "assistant", text: "another reply" },
    ]
    expect(lastUserText(messages)).toBe("second prompt")
  })

  test("skips non-user rows", () => {
    const messages = [
      { type: "user", text: "the prompt" },
      { type: "assistant", text: "newer reply" },
      { type: "shell", text: "shell output" },
      { type: "compaction", text: "compacted" },
    ]
    expect(lastUserText(messages)).toBe("the prompt")
  })

  test("skips a user row with empty text", () => {
    const messages = [
      { type: "user", text: "real prompt" },
      { type: "user", text: "   " },
      { type: "user", text: "" },
    ]
    expect(lastUserText(messages)).toBe("real prompt")
  })

  test("returns undefined when no user message exists", () => {
    expect(lastUserText([])).toBeUndefined()
    expect(lastUserText([{ type: "assistant", text: "just a reply" }])).toBeUndefined()
  })

  test("ignores rows with a missing or non-string text", () => {
    expect(lastUserText([{ type: "user" }, { type: "user", text: 42 }])).toBeUndefined()
  })
})

describe("collapse", () => {
  test("folds newlines and repeated spaces", () => {
    expect(collapse("line one\n\nline\ttwo   three")).toBe("line one line two three")
  })

  test("trims surrounding whitespace", () => {
    expect(collapse("  padded  ")).toBe("padded")
  })
})

describe("renderLine", () => {
  test("returns short text unchanged", () => {
    expect(renderLine("short prompt", 1)).toBe("short prompt")
  })

  test("fits the one-line budget: 42-column sidebar minus prefix and margin", () => {
    const text = "x".repeat(40)
    const out = renderLine(text, 1)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBe(36)
  })

  test("doubles the budget for two lines", () => {
    const text = "x".repeat(40)
    expect(renderLine(text, 2)).toBe(text)
    const long = "x".repeat(80)
    expect(renderLine(long, 2).length).toBe(72)
  })

  test("scales the budget with the line count: five lines hold 180 chars", () => {
    const text = "x".repeat(150)
    expect(renderLine(text, 5)).toBe(text)
    const long = "x".repeat(200)
    expect(renderLine(long, 5).length).toBe(180)
  })

  test("matches the fixed per-line tables at the old budgets", () => {
    const text = "x".repeat(200)
    expect(renderLine(text, 1).length).toBe(36)
    expect(renderLine(text, 2).length).toBe(72)
  })
})

describe("fromOptions", () => {
  test("undefined falls back to defaults", () => {
    expect(fromOptions(undefined)).toEqual(DEFAULTS)
  })

  test("defaults to five lines", () => {
    expect(DEFAULTS.lines).toBe(5)
  })

  test("a hostile object cannot smuggle values through", () => {
    const cfg = fromOptions({ surface: "evil", lines: "evil", onTrigger: "x" })
    expect(cfg.surface).toBe("sidebar")
    expect(cfg.lines).toBe(5)
  })

  test("real line counts are honored", () => {
    expect(fromOptions({ surface: "off" }).surface).toBe("off")
    expect(fromOptions({ lines: 2 }).lines).toBe(2)
    expect(fromOptions({ lines: 7 }).lines).toBe(7)
    expect(fromOptions({ lines: 10 }).lines).toBe(10)
  })

  test("out-of-range and non-integer line counts clamp", () => {
    expect(fromOptions({ lines: 0 }).lines).toBe(1)
    expect(fromOptions({ lines: -3 }).lines).toBe(1)
    expect(fromOptions({ lines: 99 }).lines).toBe(10)
    expect(fromOptions({ lines: 5.5 }).lines).toBe(5)
    expect(fromOptions({ lines: NaN }).lines).toBe(5)
  })

  test("storage reads validate on read like options", () => {
    expect(fromOptions({ surface: "off", lines: 2 })).toEqual({ surface: "off", lines: 2 })
    expect(fromOptions("garbage")).toEqual(DEFAULTS)
  })
})
