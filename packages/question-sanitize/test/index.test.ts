import { describe, expect, test } from "bun:test"
import { countStr, scrub } from "../index.ts"

describe("scrub", () => {
  test("strips carriage returns from top-level strings", () => {
    expect(scrub("Post as\r-is")).toBe("Post as-is")
    expect(scrub("clean text")).toBe("clean text")
  })

  test("strips carriage returns from nested question payload shapes", () => {
    const input = {
      question: "Post this note as shown?",
      header: "Post\r stage\r-3\r note",
      options: [
        { label: "Post as\r-is\r (Recommended\r)", description: "Post the\r note\r verbatim" },
        { label: "Edit first", description: "no\r returns here" },
      ],
    }
    const out = scrub(input)
    expect(out.header).toBe("Post stage-3 note")
    expect(out.options[0].label).toBe("Post as-is (Recommended)")
    expect(out.options[0].description).toBe("Post the note verbatim")
    expect(out.options[1].label).toBe("Edit first")
    expect(out.question).toBe("Post this note as shown?")
  })

  test("mutates the passed object in place", () => {
    const input = { header: "a\rb" }
    const out = scrub(input)
    expect(out).toBe(input)
    expect(input.header).toBe("ab")
  })

  test("leaves numbers, booleans, null, and undefined untouched", () => {
    const input = { count: 3, flag: true, missing: null, other: undefined }
    const out = scrub(input)
    expect(out.count).toBe(3)
    expect(out.flag).toBe(true)
    expect(out.missing).toBe(null)
    expect(out.other).toBe(undefined)
  })

  test("handles non-object input", () => {
    expect(scrub("a\rb")).toBe("ab")
    expect(scrub(42)).toBe(42)
    expect(scrub(null)).toBe(null)
  })

  test("handles arrays of strings and mixed nesting", () => {
    expect(scrub(["a\rb", "c", ["d\re"]])).toEqual(["ab", "c", ["de"]])
  })
})

describe("countStr", () => {
  test("counts carriage returns across the payload", () => {
    const input = {
      header: "a\rb\rc",
      options: [{ label: "d\r" }],
      nested: { deep: ["e\r\r"] },
    }
    expect(countStr(input)).toBe(5)
  })

  test("returns zero for clean payloads and non-strings", () => {
    expect(countStr({ header: "clean", options: [] })).toBe(0)
    expect(countStr(42)).toBe(0)
  })
})
