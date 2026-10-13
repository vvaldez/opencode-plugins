// dials — pure helpers and types. No runtime, no OpenTUI, no Bun APIs:
// everything here is testable without a TUI (see test/lib.test.ts).
//
// Trust boundary (from the security review): opencode.json can be
// project-scoped, so a hostile repository could otherwise seed executable
// commands or fetch targets into durable storage. Therefore:
//   - opencode.json options are display-only (enabled, surface, clamped
//     interval) — fromOptions never copies command/endpoint fields
//   - every check runs a fixed argv assembled in code — configuration
//     selects, never introduces, executables; no shell, no interpolation
//   - the vpn endpoint is dialog-only (user-initiated) and re-validated as
//     https on every read

export type DialStatus = "ok" | "warn" | "fail" | "unknown"
export type WidgetId = "vault" | "vpn" | "ci" | "mr"

// v1 renders the footer only; the panel milestone widens this union.
export type Surface = "footer" | "off"

export type WidgetOptions = { enabled?: boolean; surface?: Surface; interval?: number }

export type WidgetConfig = {
  enabled: boolean
  surface: Surface
  interval: number
  endpoint?: string
}

export type DialState = {
  id: WidgetId
  status: DialStatus
  detail: string
  checkedAt: number
  /** Set when the check failed because the tool/repo context is absent — the widget hides itself for the session. */
  autoHide?: boolean
}

export type DialsConfig = { widgets: Record<WidgetId, WidgetConfig> }

export const GLYPH: Record<DialStatus, string> = { ok: "✓", warn: "!", fail: "✗", unknown: "?" }
export const LABEL: Record<WidgetId, string> = { vault: "bw", vpn: "vpn", ci: "ci", mr: "mr" }
export const WIDGETS: WidgetId[] = ["vault", "vpn", "ci", "mr"]
export const SURFACES: Surface[] = ["footer", "off"]
export const MIN_INTERVAL = 10_000

export const DEFAULTS: DialsConfig = {
  widgets: {
    vault: { enabled: true, surface: "footer", interval: 120_000 },
    vpn: { enabled: true, surface: "footer", interval: 60_000, endpoint: "https://github.com" },
    ci: { enabled: true, surface: "footer", interval: 120_000 },
    mr: { enabled: true, surface: "footer", interval: 120_000 },
  },
}

// --- config validation -----------------------------------------------------

const clampInterval = (raw: unknown, fallback: number): number =>
  typeof raw === "number" && Number.isFinite(raw) && raw >= MIN_INTERVAL ? raw : fallback

// opencode.json options are display-only: hostile or merely stale fields
// (command, endpoint, unknown keys) are dropped here, never copied through.
// The vpn endpoint is always seeded with the DEFAULT constant — configuration
// can never introduce one.
export function fromOptions(id: WidgetId, raw: unknown): WidgetConfig {
  const base = DEFAULTS.widgets[id]
  const o = (raw ?? {}) as WidgetOptions
  const cfg: WidgetConfig = {
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    surface: SURFACES.includes(o.surface as Surface) ? (o.surface as Surface) : base.surface,
    interval: clampInterval(o.interval, base.interval),
  }
  if (id === "vpn") cfg.endpoint = base.endpoint
  return cfg
}

// Durable storage is seeded from options and mutated by the /dials dialog;
// validate on read so a stale or tampered shape falls back to defaults.
// The vpn endpoint is dialog-only and must be https. Storage written before
// this validation (e.g. an upgrade from an older build) is bounded by the
// same https-only read check plus the dialog's reset action.
export function fromStorage(id: WidgetId, raw: unknown): WidgetConfig {
  const cfg = fromOptions(id, raw)
  if (id === "vpn") {
    const endpoint = (raw as { endpoint?: unknown } | null)?.endpoint
    if (typeof endpoint === "string" && endpoint.startsWith("https://")) cfg.endpoint = endpoint
  }
  return cfg
}

// --- display helpers -------------------------------------------------------

// External strings (commit titles, CLI error text) can carry ANSI escapes and
// control characters; strip them before anything reaches a rendered surface.
export function safe(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b./g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 80)
    .trim()
}

// Parses the first JSON array or object in CLI output. gh returns bare
// arrays, bw returns a bare object; glab -F json returns arrays. Throws on
// malformed output — callers degrade to an unknown state, never crash.
export function firstJson(stdout: string): any {
  const start = stdout.search(/[[{]/)
  if (start === -1) throw new Error("no json")
  return JSON.parse(stdout.slice(start))
}

export function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000))
  if (m === 0) return "now"
  if (m < 60) return `${m}m`
  return `${Math.round(m / 60)}h`
}

// --- status classification --------------------------------------------------

type Classified = { status: DialStatus; detail: string }

// gh run list --json status,conclusion,displayTitle | glab ci list -F json
export function classifyCi(forge: "github" | "gitlab", stdout: string): Classified {
  try {
    const parsed = firstJson(stdout)
    const run = Array.isArray(parsed) ? parsed[0] : parsed
    if (!run) return { status: "unknown", detail: "no pipelines" }
    if (forge === "gitlab") {
      const s = String(run.status ?? "")
      const status: DialStatus = s === "success" ? "ok" : s === "failed" ? "fail" : s === "running" || s === "pending" ? "warn" : "unknown"
      return { status, detail: safe(String(run.ref ?? "")) }
    }
    const status: DialStatus =
      run.conclusion === "success" ? "ok" : run.conclusion === "failure" ? "fail" : run.status === "in_progress" || run.status === "queued" ? "warn" : "unknown"
    return { status, detail: safe(String(run.displayTitle ?? "")) }
  } catch {
    return { status: "unknown", detail: "parse" }
  }
}

// gh pr view --json state,reviewDecision,url,number | glab mr list -F json
export function classifyMr(forge: "github" | "gitlab", stdout: string): Classified {
  try {
    const parsed = firstJson(stdout)
    const mr = Array.isArray(parsed) ? parsed[0] : parsed
    if (!mr) return { status: "unknown", detail: "none" }
    if (forge === "gitlab") {
      const label = mr.iid ? `!${mr.iid}` : ""
      if (mr.state === "opened") return { status: "warn", detail: safe(`${label} open`) }
      if (mr.state === "merged") return { status: "ok", detail: safe(`${label} merged`) }
      if (mr.state === "closed") return { status: "unknown", detail: safe(`${label} closed`) }
      return { status: "unknown", detail: safe(label || "unknown") }
    }
    const label = mr.number ? `#${mr.number}` : ""
    if (mr.state === "open") {
      const reviews = mr.reviewDecision // "APPROVED" | "REVIEW_REQUIRED" | "CHANGES_REQUESTED" | null
      const status: DialStatus = reviews === "CHANGES_REQUESTED" ? "fail" : reviews === "APPROVED" ? "ok" : "warn"
      return { status, detail: safe(`${label} ${reviews ?? "review"}`.trim()) }
    }
    if (mr.state === "merged") return { status: "ok", detail: safe(`${label} merged`) }
    return { status: "unknown", detail: safe(label || "no pr") }
  } catch {
    return { status: "unknown", detail: "parse" }
  }
}
