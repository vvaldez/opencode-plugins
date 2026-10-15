import { describe, expect, test } from "bun:test"
import { DEFAULTS, collapse, fromOptions, fromStorage, lastUserText, renderLine } from "../lib.ts"

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

  test("truncates past the one-line budget with an ellipsis", () => {
    const text = "x".repeat(150)
    const out = renderLine(text, 1)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBe(100)
  })

  test("doubles the budget for two lines", () => {
    const text = "x".repeat(150)
    expect(renderLine(text, 2)).toBe(text)
    const long = "x".repeat(250)
    expect(renderLine(long, 2).length).toBe(200)
  })
})

describe("fromOptions", () => {
  test("undefined falls back to defaults", () => {
    expect(fromOptions(undefined)).toEqual(DEFAULTS)
  })

  test("a hostile object cannot smuggle values through", () => {
    const cfg = fromOptions({ surface: "evil", lines: 7, onTrigger: "x" })
    expect(cfg.surface).toBe("sidebar")
    expect(cfg.lines).toBe(1)
  })

  test("known values are honored", () => {
    expect(fromOptions({ surface: "off" }).surface).toBe("off")
    expect(fromOptions({ lines: 2 }).lines).toBe(2)
  })
})

describe("fromStorage", () => {
  test("validates on read like options", () => {
    expect(fromStorage({ surface: "off", lines: 2 })).toEqual({ surface: "off", lines: 2 })
    expect(fromStorage("garbage")).toEqual(DEFAULTS)
  })
})