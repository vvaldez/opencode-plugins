/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import {
  DEFAULTS,
  GLYPH,
  LABEL,
  WIDGETS,
  ago,
  classifyCi,
  classifyMr,
  firstJson,
  fromOptions,
  fromStorage,
  safe,
  type DialState,
  type DialsConfig,
  type WidgetConfig,
  type WidgetId,
} from "./lib.ts"

// dials — ambient status segments for the OpenCode TUI footer.
//
// v1 widgets: vault (bw lock state), net (reachability probe), ci (pipeline
// via gh/glab), mr (current branch MR state via gh/glab). Data comes from
// local CLIs the user already authenticated — the plugin holds no
// credentials.
//
// Trust boundary (see lib.ts): opencode.json options are display-only;
// every check runs a fixed argv assembled in code — configuration selects,
// never introduces, executables; the net endpoint is dialog-only and
// https-validated, with a reset action for any persisted value.
//
// Repaint model: slot renders do not track store mutations reactively — a
// shared signal (bumped by pollers and a heartbeat) drives every repaint.
// The heartbeat also ages the staleness display.

const STDIO_CAP = 8192
const STDERR_CAP = 512
const BRANCH_TTL = 15_000
const HEARTBEAT_MS = 15_000
const PENDING_GRACE = 30_000

// Runs a fixed argv via Bun.spawn (the TUI runtime is Bun; node:child_process
// events do not fire here). Argv elements pass through literally — there is
// no shell and nothing to quote or inject. Both pipes are capped; a stream
// exceeding its cap kills the process. exited and the drains resolve together
// so a fast-exiting child cannot win a race with its own output.
async function runArgv(argv: string[], cwd?: string, timeoutMs = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutMs })
  } catch {
    return { code: 127, stdout: "", stderr: "" }
  }
  const drain = async (stream: ReadableStream<Uint8Array> | undefined, cap: number, killOnCap: boolean) => {
    if (!stream) return ""
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let out = ""
    try {
      while (out.length < cap) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
      }
      if (out.length >= cap && killOnCap) {
        try { proc.kill() } catch {}
        try { await reader.cancel() } catch {}
      }
    } catch {}
    return out
  }
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    drain(proc.stdout as ReadableStream<Uint8Array> | undefined, STDIO_CAP, true),
    drain(proc.stderr as ReadableStream<Uint8Array> | undefined, STDERR_CAP, false),
  ])
  return { code: code ?? 1, stdout, stderr }
}

// A timed-out or killed child can orphan grandchildren of the command it ran;
// accepted for v1 (fixed argv commands are short-lived CLI queries).
const timedOut = (code: number) => code === 124

async function detectForge(cwd: string): Promise<"github" | "gitlab" | undefined> {
  const { stdout } = await runArgv(["git", "remote", "get-url", "origin"], cwd, 5_000)
  const url = stdout.trim()
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab")) return "gitlab"
  return undefined
}

// --- widget checks (fixed argv only) ----------------------------------------

async function checkVault(cwd: string): Promise<DialState> {
  const { code, stdout, stderr } = await runArgv(["bw", "status"], cwd, 8_000)
  if (code === 127) return { id: "vault", status: "unknown", detail: "no bw", autoHide: true, checkedAt: Date.now() }
  try {
    const parsed = firstJson(stdout)
    if (parsed?.status === "unlocked") return { id: "vault", status: "ok", detail: "unlocked", checkedAt: Date.now() }
    if (parsed?.status === "locked") return { id: "vault", status: "fail", detail: "locked", checkedAt: Date.now() }
    return { id: "vault", status: "warn", detail: safe(String(parsed?.status ?? "unknown")), checkedAt: Date.now() }
  } catch {
    if (timedOut(code)) return { id: "vault", status: "unknown", detail: "timed out", checkedAt: Date.now() }
    return { id: "vault", status: "unknown", detail: safe(stderr) || "parse", checkedAt: Date.now() }
  }
}

async function checkVpn(cfg: WidgetConfig): Promise<DialState> {
  const target = cfg.endpoint ?? "https://github.com"
  if (!target.startsWith("https://")) return { id: "vpn", status: "unknown", detail: "bad endpoint", checkedAt: Date.now() }
  try {
    const res = await fetch(target, { method: "HEAD", signal: AbortSignal.timeout(5_000) })
    return { id: "vpn", status: res.ok ? "ok" : "warn", detail: res.ok ? "reachable" : `http ${res.status}`, checkedAt: Date.now() }
  } catch {
    return { id: "vpn", status: "fail", detail: "unreachable", checkedAt: Date.now() }
  }
}

async function checkCi(cwd: string, branch: string): Promise<DialState> {
  const forge = await detectForge(cwd)
  if (!forge) return { id: "ci", status: "unknown", detail: "no git repo", autoHide: true, checkedAt: Date.now() }
  const { code, stdout, stderr } = forge === "gitlab"
    ? await runArgv(["glab", "ci", "list", "-F", "json", "--ref", branch], cwd)
    : await runArgv(["gh", "run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,displayTitle"], cwd)
  if (code === 127) return { id: "ci", status: "unknown", detail: forge === "gitlab" ? "no glab" : "no gh", autoHide: true, checkedAt: Date.now() }
  if (code !== 0) {
    return { id: "ci", status: "unknown", detail: timedOut(code) ? "timed out" : safe(stderr) || `${forge} exit ${code}`, checkedAt: Date.now() }
  }
  const { status, detail } = classifyCi(forge, stdout)
  return { id: "ci", status, detail, checkedAt: Date.now() }
}

async function checkMr(cwd: string, branch: string): Promise<DialState> {
  const forge = await detectForge(cwd)
  if (!forge) return { id: "mr", status: "unknown", detail: "no git repo", autoHide: true, checkedAt: Date.now() }
  const { code, stdout, stderr } = forge === "gitlab"
    ? await runArgv(["glab", "mr", "list", "-F", "json", "--source-branch", branch], cwd)
    : await runArgv(["gh", "pr", "view", "--json", "state,reviewDecision,url,number"], cwd)
  if (code === 127) return { id: "mr", status: "unknown", detail: forge === "gitlab" ? "no glab" : "no gh", autoHide: true, checkedAt: Date.now() }
  if (code !== 0) {
    // gh exits non-zero when the branch has no PR — that is a normal state.
    const reason = safe(stderr)
    const none = /no pull request|no open pull/i.test(reason)
    return { id: "mr", status: "unknown", detail: timedOut(code) ? "timed out" : none ? "no pr" : reason || "none", checkedAt: Date.now() }
  }
  const { status, detail } = classifyMr(forge, stdout)
  return { id: "mr", status, detail, checkedAt: Date.now() }
}

// --- plugin -----------------------------------------------------------------

export default Plugin.define({
  id: "vvaldez.dials.tui",
  setup(context) {
    // Options are display-only (lib.ts fromOptions) — a hostile project
    // config can at worst show/hide a widget or slow its cadence to the
    // clamped floor; it cannot introduce commands or fetch targets.
    const options = context.options as { widgets?: Partial<Record<WidgetId, unknown>> } | undefined
    const seeded: DialsConfig = {
      widgets: {
        vault: fromOptions("vault", options?.widgets?.vault),
        vpn: fromOptions("vpn", options?.widgets?.vpn),
        ci: fromOptions("ci", options?.widgets?.ci),
        mr: fromOptions("mr", options?.widgets?.mr),
      },
    }
    const [settings, updateSettings] = context.storage.store("settings", { initial: seeded })

    // Every read of stored settings passes through fromStorage: unknown
    // shapes fall back to defaults (future-proof against schema drift) and
    // the endpoint is re-validated as https.
    const widgetCfg = (id: WidgetId): WidgetConfig => fromStorage(id, (settings.widgets as Record<string, unknown>)?.[id])

    const startedAt = Date.now()
    const states: Partial<Record<WidgetId, DialState>> = {}
    const hidden = new Set<WidgetId>()
    const inFlight = new Set<WidgetId>()
    const [version, bump] = createSignal(0, { equals: false })
    const heartbeat = setInterval(() => bump(), HEARTBEAT_MS)

    const cwd = context.location?.directory ?? process.cwd()

    let branchCache: { value: string; at: number } | null = null
    async function readBranch(): Promise<string> {
      if (branchCache && Date.now() - branchCache.at < BRANCH_TTL) return branchCache.value
      const loc = context.location ?? context.data.location.default()
      // vcs.sync is documented but its settle time is not bounded; race it
      // against a timer so a hung sync cannot stall a poll cycle.
      await Promise.race([context.data.location.vcs.sync(loc), new Promise<void>((resolve) => setTimeout(resolve, 10_000))])
      const vcs = context.data.location.vcs.info(loc)
      const value = vcs?.branch.current ?? ""
      branchCache = { value, at: Date.now() }
      return value
    }

    async function checkOne(id: WidgetId): Promise<void> {
      if (inFlight.has(id)) return
      inFlight.add(id)
      try {
        const cfg = widgetCfg(id)
        let state: DialState
        if (id === "vault") state = await checkVault(cwd)
        else if (id === "vpn") state = await checkVpn(cfg)
        else {
          const branch = await readBranch()
          if (!branch) state = { id, status: "unknown", detail: "no branch", autoHide: true, checkedAt: Date.now() }
          else if (id === "ci") state = await checkCi(cwd, branch)
          else state = await checkMr(cwd, branch)
        }
        if (state.autoHide) {
          // Absent tool or repo context: hiding beats a permanent ✗ the user
          // cannot act on. Session-only (not persisted) so a transient PATH
          // issue self-heals on next load; a one-time toast explains it.
          delete states[id]
          if (!hidden.has(id)) {
            hidden.add(id)
            context.ui.toast.show({ message: `${LABEL[id]} hidden — ${state.detail}; enable via /dials` })
          }
        } else {
          states[id] = state
        }
      } catch (e) {
        states[id] = { id, status: "fail", detail: safe(String(e)), checkedAt: Date.now() }
      } finally {
        inFlight.delete(id)
        bump()
      }
    }

    const timers: ReturnType<typeof setInterval>[] = []

    function poll(id: WidgetId) {
      const cfg = widgetCfg(id)
      if (!cfg.enabled || hidden.has(id)) return
      void checkOne(id)
      timers.push(setInterval(() => void checkOne(id), cfg.interval))
    }

    function startAll() {
      timers.forEach(clearInterval)
      timers.length = 0
      WIDGETS.forEach(poll)
    }
    startAll()

    const refreshAll = async () => {
      const ids = WIDGETS.filter((id) => widgetCfg(id).enabled && !hidden.has(id))
      await Promise.all(ids.map(checkOne))
      const trouble = ids.filter((id) => {
        const s = states[id]
        return s && (s.status === "fail" || s.status === "unknown")
      })
      if (trouble.length > 0) {
        context.ui.toast.show({ message: `dials refreshed · ${trouble.map((id) => LABEL[id]).join(", ")} failing` })
      } else {
        context.ui.toast.show({ message: "dials refreshed", variant: "success" })
      }
    }

    // Footer: compact segments after OpenCode's health indicators.
    const slot = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        version() // subscribe: every bump repaints
        const pending = Date.now() - startedAt < PENDING_GRACE
        const segments: string[] = []
        for (const id of WIDGETS) {
          const cfg = widgetCfg(id)
          const state = states[id]
          if (!cfg.enabled || cfg.surface === "off" || hidden.has(id)) continue
          if (!state) {
            segments.push(`${LABEL[id]} ${pending ? "…" : "?"}`)
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
        const cfg = widgetCfg(id)
        const state = states[id]
        const stateText = state ? `${GLYPH[state.status]} ${state.detail}` : "…"
        return {
          title: `${id} — ${stateText} [${cfg.surface}]`,
          value: id,
          category: hidden.has(id) ? "Hidden" : cfg.enabled ? "Enabled" : "Disabled",
          description: id === "vpn" ? `reachability probe · ${cfg.endpoint ?? ""}` : `interval ${Math.round(cfg.interval / 1000)}s`,
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
              const widget = id as WidgetId
              updateSettings((draft: DialsConfig) => {
                const next = widgetCfg(widget).surface === "off" ? "footer" : "off"
                draft.widgets[widget].surface = next
              })
              bump()
              context.ui.toast.show({ message: `${widget} surface → ${widgetCfg(widget).surface}` })
            },
          },
          {
            bind: "ctrl+e",
            title: "Enable",
            onTrigger: (id) => {
              const widget = id as WidgetId
              updateSettings((draft: DialsConfig) => {
                draft.widgets[widget].enabled = !draft.widgets[widget].enabled
              })
              hidden.delete(widget)
              delete states[widget]
              startAll()
              bump()
              context.ui.toast.show({ message: `${widget} ${widgetCfg(widget).enabled ? "enabled" : "disabled"}` })
            },
          },
          {
            bind: "ctrl+r",
            title: "Refresh",
            onTrigger: (id) => {
              const widget = id as WidgetId
              if (!widgetCfg(widget).enabled) {
                context.ui.toast.show({ message: `${widget} is disabled` })
                return
              }
              hidden.delete(widget)
              void checkOne(widget)
            },
          },
          {
            bind: "ctrl+h",
            title: "Endpoint",
            onTrigger: (id) => {
              const widget = id as WidgetId
              if (widget !== "vpn") {
                context.ui.toast.show({ message: "endpoint applies to net only" })
                return
              }
              void (async () => {
                const answer = await context.ui.dialog.prompt({ title: "net endpoint", placeholder: "https://github.com" })
                if (!answer) return
                const url = answer.trim()
                if (!url.startsWith("https://")) {
                  context.ui.toast.show({ message: "endpoint must start with https://" })
                  return
                }
                updateSettings((draft: DialsConfig) => {
                  draft.widgets.vpn.endpoint = url
                })
                void checkOne("vpn")
                context.ui.toast.show({ message: "net endpoint set", variant: "success" })
              })()
            },
          },
          {
            bind: "ctrl+x",
            title: "Reset",
            onTrigger: (id) => {
              const widget = id as WidgetId
              updateSettings((draft: DialsConfig) => {
                draft.widgets[widget] = { ...DEFAULTS.widgets[widget] }
              })
              hidden.delete(widget)
              delete states[widget]
              startAll()
              bump()
              context.ui.toast.show({ message: `${widget} reset to defaults`, variant: "success" })
            },
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
