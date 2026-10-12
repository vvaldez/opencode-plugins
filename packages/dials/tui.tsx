/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"

// dials — ambient status segments for the OpenCode TUI footer.
//
// v1 widgets: vault (bw lock state), vpn (reachability), ci (pipeline via gh/glab),
// mr (current branch MR state via gh/glab). Data comes from local CLIs the user
// already authenticated — the plugin holds no credentials.
//
// Config model: opencode.json options seed defaults on first run; the /dials
// dialog mutates durable storage; storage wins afterward.
//
// Repaint model: slot renders do not track store mutations reactively — a
// shared signal (bumped by pollers and a heartbeat) drives every repaint.
// The heartbeat also ages the staleness display.

type DialStatus = "ok" | "warn" | "fail" | "unknown"
type WidgetId = "vault" | "vpn" | "ci" | "mr"
type Surface = "footer" | "panel" | "both" | "off"

type WidgetConfig = {
  enabled: boolean
  surface: Surface
  interval: number
  command?: string
  endpoint?: string
}

type DialState = {
  id: WidgetId
  status: DialStatus
  detail: string
  checkedAt: number
}

type DialsConfig = { widgets: Record<WidgetId, WidgetConfig> }

const GLYPH: Record<DialStatus, string> = { ok: "✓", warn: "!", fail: "✗", unknown: "?" }
const LABEL: Record<WidgetId, string> = { vault: "bw", vpn: "vpn", ci: "ci", mr: "mr" }
const WIDGETS: WidgetId[] = ["vault", "vpn", "ci", "mr"]
const SURFACES: Surface[] = ["footer", "panel", "both", "off"]

const DEFAULTS: DialsConfig = {
  widgets: {
    vault: { enabled: true, surface: "footer", interval: 120_000 },
    vpn: { enabled: true, surface: "footer", interval: 60_000, endpoint: "https://github.com" },
    ci: { enabled: true, surface: "footer", interval: 120_000 },
    mr: { enabled: true, surface: "footer", interval: 120_000 },
  },
}

// --- shell helpers ---------------------------------------------------------

// POSIX single-quote escaping for values substituted into configurable commands.
const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

// Runs a user-configured shell command via Bun.spawn (the TUI runtime is Bun;
// node:child_process events do not fire here). Commands come from the user's
// own config (their machine, their settings); output is truncated defensively.
function runCommand(command: string, cwd?: string, timeoutMs = 15_000): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    try {
      const proc = Bun.spawn(["/bin/sh", "-c", command], { cwd, stdout: "pipe", stderr: "ignore" })
      let stdout = ""
      const timer = setTimeout(() => {
        try { proc.kill() } catch {}
        resolve({ code: 124, stdout })
      }, timeoutMs)
      void new Response(proc.stdout).text().then((text) => {
        stdout = text.slice(0, 8192)
      })
      void proc.exited.then((code) => {
        clearTimeout(timer)
        resolve({ code, stdout })
      })
    } catch {
      resolve({ code: 127, stdout: "" })
    }
  })
}

const ago = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000))
  if (m === 0) return "now"
  if (m < 60) return `${m}m`
  return `${Math.round(m / 60)}h`
}

const firstJson = (stdout: string): any => {
  const start = stdout.search(/[[{]/)
  if (start === -1) return undefined
  return JSON.parse(stdout.slice(start))
}

async function detectForge(cwd: string): Promise<"github" | "gitlab" | undefined> {
  const { stdout } = await runCommand("git remote get-url origin", cwd, 5_000)
  const url = stdout.trim()
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab")) return "gitlab"
  return undefined
}

// --- widget checks ---------------------------------------------------------

async function checkVault(cfg: WidgetConfig, cwd: string): Promise<DialState> {
  const { code, stdout } = await runCommand(cfg.command ?? "bw status", cwd, 8_000)
  try {
    const parsed = firstJson(stdout)
    if (parsed?.status === "unlocked") return { id: "vault", status: "ok", detail: "unlocked", checkedAt: Date.now() }
    if (parsed?.status === "locked") return { id: "vault", status: "fail", detail: "locked", checkedAt: Date.now() }
    return { id: "vault", status: "warn", detail: String(parsed?.status ?? "unknown"), checkedAt: Date.now() }
  } catch {
    return { id: "vault", status: code === 127 ? "fail" : "unknown", detail: code === 127 ? "no bw" : "parse", checkedAt: Date.now() }
  }
}

async function checkVpn(cfg: WidgetConfig): Promise<DialState> {
  const target = cfg.endpoint ?? "https://github.com"
  try {
    const res = await fetch(target, { method: "HEAD", signal: AbortSignal.timeout(5_000) })
    const host = new URL(target).host
    return { id: "vpn", status: res.ok ? "ok" : "warn", detail: res.ok ? host : `http ${res.status}`, checkedAt: Date.now() }
  } catch {
    return { id: "vpn", status: "fail", detail: "unreachable", checkedAt: Date.now() }
  }
}

async function checkCi(cfg: WidgetConfig, cwd: string, branch: string): Promise<DialState> {
  const forge = await detectForge(cwd)
  const cmd = cfg.command ?? (forge === "gitlab" ? `glab ci list --ref ${shq(branch)}` : `gh run list --branch ${shq(branch)} --limit 1 --json status,conclusion,displayTitle`)
  const { code, stdout } = await runCommand(cmd, cwd)
  if (code !== 0) return { id: "ci", status: "unknown", detail: forge === "gitlab" ? "glab" : "gh", checkedAt: Date.now() }
  if (forge === "gitlab") {
    const line = stdout.toLowerCase()
    if (line.includes("passed")) return { id: "ci", status: "ok", detail: branch, checkedAt: Date.now() }
    if (line.includes("failed")) return { id: "ci", status: "fail", detail: branch, checkedAt: Date.now() }
    if (line.includes("running") || line.includes("pending")) return { id: "ci", status: "warn", detail: branch, checkedAt: Date.now() }
    return { id: "ci", status: "unknown", detail: branch || "no pipelines", checkedAt: Date.now() }
  }
  try {
    const runs = firstJson(stdout)
    const run = Array.isArray(runs) ? runs[0] : runs
    if (!run) return { id: "ci", status: "unknown", detail: "no runs", checkedAt: Date.now() }
    const status: DialStatus =
      run.conclusion === "success" ? "ok" : run.conclusion === "failure" ? "fail" : run.status === "in_progress" || run.status === "queued" ? "warn" : "unknown"
    return { id: "ci", status, detail: String(run.displayTitle ?? "").slice(0, 24), checkedAt: Date.now() }
  } catch {
    return { id: "ci", status: "unknown", detail: "parse", checkedAt: Date.now() }
  }
}

async function checkMr(cfg: WidgetConfig, cwd: string, branch: string): Promise<DialState> {
  const forge = await detectForge(cwd)
  const cmd = cfg.command ?? (forge === "gitlab" ? `glab mr list --source-branch ${shq(branch)}` : `gh pr view --json state,reviewDecision,url,number`)
  const { code, stdout } = await runCommand(cmd, cwd)
  if (forge === "gitlab") {
    if (code !== 0) return { id: "mr", status: "unknown", detail: "glab", checkedAt: Date.now() }
    const line = stdout.toLowerCase()
    const m = stdout.match(/!(\d+)/)
    if (line.includes("merged")) return { id: "mr", status: "ok", detail: `!${m?.[1] ?? ""} merged`, checkedAt: Date.now() }
    if (line.includes("opened") || line.includes("open")) return { id: "mr", status: "warn", detail: `!${m?.[1] ?? ""} open`, checkedAt: Date.now() }
    return { id: "mr", status: "unknown", detail: "none", checkedAt: Date.now() }
  }
  try {
    const pr = firstJson(stdout)
    const label = pr?.number ? `#${pr.number}` : ""
    if (pr?.state === "open") {
      const reviews = pr.reviewDecision // "APPROVED" | "REVIEW_REQUIRED" | "CHANGES_REQUESTED" | null
      const status: DialStatus = reviews === "CHANGES_REQUESTED" ? "fail" : reviews === "APPROVED" ? "ok" : "warn"
      return { id: "mr", status, detail: `${label} ${reviews ?? "review"}`.trim(), checkedAt: Date.now() }
    }
    if (pr?.state === "merged") return { id: "mr", status: "ok", detail: `${label} merged`, checkedAt: Date.now() }
    return { id: "mr", status: "unknown", detail: label || "no pr", checkedAt: Date.now() }
  } catch {
    // gh exits non-zero with no PR open for the branch
    return { id: "mr", status: "unknown", detail: "no pr", checkedAt: Date.now() }
  }
}

// --- plugin ----------------------------------------------------------------

export default Plugin.define({
  id: "vvaldez.dials.tui",
  setup(context) {
    const options = context.options as Partial<DialsConfig> | undefined
    const seeded: DialsConfig = {
      widgets: {
        vault: { ...DEFAULTS.widgets.vault, ...(options?.widgets?.vault ?? {}) },
        vpn: { ...DEFAULTS.widgets.vpn, ...(options?.widgets?.vpn ?? {}) },
        ci: { ...DEFAULTS.widgets.ci, ...(options?.widgets?.ci ?? {}) },
        mr: { ...DEFAULTS.widgets.mr, ...(options?.widgets?.mr ?? {}) },
      },
    }
    const [settings, updateSettings] = context.storage.store("settings", { initial: seeded })

    // Live state: plain map + a repaint signal. Slot renders do not track
    // store mutations reactively; pollers and the heartbeat bump the signal
    // to drive every repaint (the heartbeat also ages staleness displays).
    const states: Partial<Record<WidgetId, DialState>> = {}
    const [version, bump] = createSignal(0, { equals: false })
    const heartbeat = setInterval(() => bump(), 1_000)

    const cwd = context.location?.directory ?? process.cwd()

    async function readBranch(): Promise<string> {
      await context.data.location.vcs.sync(context.location)
      const vcs = context.data.location.vcs.info(context.location)
      return vcs?.branch.current ?? ""
    }

    async function checkOne(id: WidgetId, cfg: WidgetConfig): Promise<DialState> {
      if (id === "vault") return checkVault(cfg, cwd)
      if (id === "vpn") return checkVpn(cfg)
      const branch = await readBranch()
      if (id === "ci") return checkCi(cfg, cwd, branch)
      return checkMr(cfg, cwd, branch)
    }

    const timers: ReturnType<typeof setInterval>[] = []

    function poll(id: WidgetId, once = false) {
      const cfg = settings.widgets[id]
      if (!cfg?.enabled) return
      const check = async () => {
        try {
          states[id] = await checkOne(id, cfg)
        } catch (e) {
          states[id] = { id, status: "fail", detail: String(e).slice(0, 40), checkedAt: Date.now() }
        }
        bump()
      }
      void check()
      if (!once) timers.push(setInterval(check, cfg.interval))
    }

    function startAll() {
      timers.forEach(clearInterval)
      timers.length = 0
      WIDGETS.forEach((id) => poll(id))
    }
    startAll()

    const refreshAll = async () => {
      await Promise.all(WIDGETS.map((id) => poll(id, true)))
    }

    // Footer: compact segments after OpenCode's health indicators.
    const slot = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        version() // subscribe: every bump repaints
        const segments: string[] = []
        for (const id of WIDGETS) {
          const cfg = settings.widgets[id]
          const state = states[id]
          if (!cfg?.enabled || cfg.surface === "off" || cfg.surface === "panel") continue
          if (!state) {
            segments.push(`${LABEL[id]} …`)
            continue
          }
          const stale = id === "ci" || id === "mr" ? ` ${ago(state.checkedAt)}` : ""
          segments.push(`${LABEL[id]} ${GLYPH[state.status]}${stale}`)
        }
        return <text fg={context.theme.text.base}>{segments.join(" · ")}</text>
      },
    })

    // Commands: /dials (configure) and /dials-refresh.
    function openConfig() {
      const options = WIDGETS.map((id) => {
        const cfg = settings.widgets[id]
        const state = states[id]
        return {
          title: `${id} — ${state ? GLYPH[state.status] : "?"} ${state?.detail ?? ""} [${cfg.surface}]`,
          value: id,
          category: cfg.enabled ? "Enabled" : "Disabled",
          description: `interval ${Math.round(cfg.interval / 1000)}s${cfg.endpoint ? ` · ${cfg.endpoint}` : ""}`,
        }
      })
      void context.ui.dialog.select({
        title: "Dials",
        options,
        actions: [
          {
            bind: "ctrl+s",
            title: "Surface",
            onTrigger: (id) => {
              updateSettings((draft: DialsConfig) => {
                const current = SURFACES.indexOf(draft.widgets[id as WidgetId].surface)
                draft.widgets[id as WidgetId].surface = SURFACES[(current + 1) % SURFACES.length]
              })
              bump()
            },
          },
          {
            bind: "ctrl+e",
            title: "Enable",
            onTrigger: (id) => {
              updateSettings((draft: DialsConfig) => {
                draft.widgets[id as WidgetId].enabled = !draft.widgets[id as WidgetId].enabled
              })
              startAll()
              bump()
            },
          },
          {
            bind: "ctrl+r",
            title: "Refresh",
            onTrigger: (id) => void poll(id as WidgetId, true),
          },
        ],
      })
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "vvaldez.dials.configure",
          title: "Configure dials",
          group: "Dials",
          slash: { name: "dials" },
          palette: true,
          run: () => openConfig(),
        },
        {
          id: "vvaldez.dials.refresh",
          title: "Refresh dials",
          group: "Dials",
          slash: { name: "dials-refresh" },
          palette: true,
          run: async () => {
            await refreshAll()
            context.ui.toast.show({ message: "dials refreshed", variant: "success" })
          },
        },
      ],
    }))

    return () => {
      clearInterval(heartbeat)
      timers.forEach(clearInterval)
      if (typeof slot === "function") (slot as unknown as () => void)()
    }
  },
})
