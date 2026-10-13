/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import {
  DEFAULTS,
  GLYPH,
  LABEL,
  WIDGETS,
  ago,
  ciRuns,
  classifyCi,
  classifyMr,
  firstJson,
  fromOptions,
  fromStorage,
  mrInfo,
  safe,
  type CiRun,
  type DialState,
  type DialStatus,
  type DialsConfig,
  type MrInfo,
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
// so a fast-exiting child cannot win a race with its own output. Bun reports
// exitCode null for signal kills (its native timeout, or the cap kill) —
// surfaced as `killed`, not a GNU-style 124.
async function runArgv(argv: string[], cwd?: string, timeoutMs = 15_000): Promise<{ code: number; killed: boolean; stdout: string; stderr: string }> {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutMs })
  } catch {
    return { code: 127, killed: false, stdout: "", stderr: "" }
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
  const [rawCode, stdout, stderr] = await Promise.all([
    proc.exited,
    drain(proc.stdout as ReadableStream<Uint8Array> | undefined, STDIO_CAP, true),
    drain(proc.stderr as ReadableStream<Uint8Array> | undefined, STDERR_CAP, false),
  ])
  return { code: rawCode ?? 1, killed: rawCode === null, stdout, stderr }
}

// A timed-out or killed child can orphan grandchildren of the command it ran;
// accepted for v1 (fixed argv commands are short-lived CLI queries).

async function detectForge(cwd: string): Promise<"github" | "gitlab" | undefined> {
  const { stdout } = await runArgv(["git", "remote", "get-url", "origin"], cwd, 5_000)
  const url = stdout.trim()
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab")) return "gitlab"
  return undefined
}

// --- widget checks (fixed argv only) ----------------------------------------

async function checkVault(cwd: string): Promise<DialState> {
  const { code, killed, stdout, stderr } = await runArgv(["bw", "status"], cwd, 8_000)
  if (code === 127) return { id: "vault", status: "unknown", detail: "no bw", autoHide: true, checkedAt: Date.now() }
  try {
    const parsed = firstJson(stdout)
    if (parsed?.status === "unlocked") return { id: "vault", status: "ok", detail: "unlocked", checkedAt: Date.now() }
    if (parsed?.status === "locked") return { id: "vault", status: "fail", detail: "locked", checkedAt: Date.now() }
    return { id: "vault", status: "warn", detail: safe(String(parsed?.status ?? "unknown")), checkedAt: Date.now() }
  } catch {
    if (killed) return { id: "vault", status: "unknown", detail: "timed out", checkedAt: Date.now() }
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
  const { code, killed, stdout, stderr } = forge === "gitlab"
    ? await runArgv(["glab", "ci", "list", "-F", "json", "--ref", branch], cwd)
    : await runArgv(["gh", "run", "list", "--branch", branch, "--limit", "1", "--json", "status,conclusion,displayTitle"], cwd)
  if (code === 127) return { id: "ci", status: "unknown", detail: forge === "gitlab" ? "no glab" : "no gh", autoHide: true, checkedAt: Date.now() }
  if (code !== 0) {
    return { id: "ci", status: "unknown", detail: killed ? "timed out" : safe(stderr) || `${forge} exit ${code}`, checkedAt: Date.now() }
  }
  const { status, detail } = classifyCi(forge, stdout)
  return { id: "ci", status, detail, checkedAt: Date.now() }
}

async function checkMr(cwd: string, branch: string): Promise<DialState> {
  const forge = await detectForge(cwd)
  if (!forge) return { id: "mr", status: "unknown", detail: "no git repo", autoHide: true, checkedAt: Date.now() }
  const { code, killed, stdout, stderr } = forge === "gitlab"
    ? await runArgv(["glab", "mr", "list", "-F", "json", "--source-branch", branch], cwd)
    : await runArgv(["gh", "pr", "view", "--json", "state,reviewDecision,url,number"], cwd)
  if (code === 127) return { id: "mr", status: "unknown", detail: forge === "gitlab" ? "no glab" : "no gh", autoHide: true, checkedAt: Date.now() }
  if (code !== 0) {
    // gh exits non-zero when the branch has no PR — that is a normal state.
    const reason = safe(stderr)
    const none = /no pull request|no open pull/i.test(reason)
    return { id: "mr", status: "unknown", detail: killed ? "timed out" : none ? "no pr" : reason || "none", checkedAt: Date.now() }
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
      // against a timer so a hung sync cannot stall a poll cycle. .catch keeps
      // the loser's rejection from going unhandled when the timer wins.
      await Promise.race([context.data.location.vcs.sync(loc).catch(() => {}), new Promise<void>((resolve) => setTimeout(resolve, 10_000))])
      const vcs = context.data.location.vcs.info(loc)
      const value = vcs?.branch.current ?? ""
      // A branch name beginning with "-" is legal git but an option-lookalike
      // in a CLI flag value — reject it at the trust boundary (secops review).
      if (value.startsWith("-")) return ""
      branchCache = { value, at: Date.now() }
      return value
    }

    // --- detail views (panel milestone) ----------------------------------------

    // Detail data is fetched on demand (each time the dialog opens a view) —
    // the footer pollers stay on their own cadence. Solid signals: the panel
    // slot's render body runs once and untracked (plugin/render.tsx Slot
    // semantics), so the JSX reads these through function children — the only
    // tracked path into a mounted contribution. An optional note carries CLI
    // failures (timed out, no gh, exit code, stderr) — a failed fetch must
    // not read as a false "none" (devops review TRACK).
    const [ciDetail, setCiDetail] = createSignal<{ runs: CiRun[]; at: number; note?: string } | undefined>(undefined)
    const [mrDetail, setMrDetail] = createSignal<{ info: MrInfo | undefined; at: number; note?: string } | undefined>(undefined)

    async function loadDetail(view: "ci" | "mr"): Promise<void> {
      const fail = (note: string) => {
        if (view === "ci") setCiDetail({ runs: [], at: Date.now(), note })
        else setMrDetail({ info: undefined, at: Date.now(), note })
      }
      const none = () => {
        if (view === "ci") setCiDetail({ runs: [], at: Date.now() })
        else setMrDetail({ info: undefined, at: Date.now() })
      }
      try {
        const branch = await readBranch()
        if (!branch) return none()
        const forge = await detectForge(cwd)
        if (!forge) return none()
        const argv =
          view === "ci"
            ? forge === "gitlab"
              ? ["glab", "ci", "list", "-F", "json", "--ref", branch]
              : ["gh", "run", "list", "--branch", branch, "--limit", "5", "--json", "status,conclusion,displayTitle,createdAt"]
            : forge === "gitlab"
              ? ["glab", "mr", "list", "-F", "json", "--source-branch", branch]
              : ["gh", "pr", "view", "--json", "state,reviewDecision,url,number,title"]
        const { code, killed, stdout, stderr } = await runArgv(argv, cwd)
        if (code === 127) return fail(forge === "gitlab" ? "no glab" : "no gh")
        if (code !== 0) {
          // gh exits non-zero when the branch has no PR — a normal none.
          const reason = safe(stderr)
          if (view === "mr" && /no pull request|no open pull/i.test(reason)) return none()
          return fail(killed ? "timed out" : reason || `${forge} exit ${code}`)
        }
        if (view === "ci") setCiDetail({ runs: ciRuns(forge, stdout), at: Date.now() })
        else setMrDetail({ info: mrInfo(forge, stdout), at: Date.now() })
      } catch (e) {
        fail(safe(String(e)))
      }
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

    const timers = new Map<WidgetId, ReturnType<typeof setInterval>>()

    function poll(id: WidgetId) {
      const cfg = widgetCfg(id)
      if (!cfg.enabled || hidden.has(id)) return
      const existing = timers.get(id)
      if (existing) clearInterval(existing)
      void checkOne(id)
      timers.set(id, setInterval(() => void checkOne(id), cfg.interval))
    }

    // Re-register one widget's interval — used when an auto-hidden widget is
    // un-hidden by a dialog action, so its cadence resumes.
    function restart(id: WidgetId) {
      poll(id)
    }

    function startAll() {
      timers.forEach((t) => clearInterval(t))
      timers.clear()
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
        context.ui.toast.show({ message: `dials refreshed · ${trouble.map((id) => LABEL[id]).join(", ")} need attention` })
      } else {
        context.ui.toast.show({ message: "dials refreshed", variant: "success" })
      }
    }

    // The theme's semantic feedback colors (theme 2.0.28): ok/warn/fail take
    // their kind, unknown stays muted. Shared by the footer and the panel.
    const colorFor = (status: DialStatus) =>
      status === "ok"
        ? context.theme.text.feedback.success.base
        : status === "warn"
          ? context.theme.text.feedback.warning.base
          : status === "fail"
            ? context.theme.text.feedback.error.base
            : context.theme.text.muted

    // Footer: compact segments after OpenCode's health indicators. One text
    // node with span children — sibling text nodes wrap (the slot container
    // constrains each item); spans flow inline, the host's own footer hints
    // use the same pattern. Each dial takes the feedback color for its
    // status (panel-milestone decision); separators and pending markers stay
    // muted.
    const slot = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        version() // subscribe: every bump repaints
        const pending = Date.now() - startedAt < PENDING_GRACE
        const parts: any[] = []
        let first = true
        for (const id of WIDGETS) {
          const cfg = widgetCfg(id)
          const state = states[id]
          if (!cfg.enabled || cfg.surface === "off" || hidden.has(id)) continue
          // Spans take color via style (the host's footer hints do the same) —
          // a bare fg prop on a span is ignored.
          if (!first) parts.push(<span style={{ fg: context.theme.text.muted }}> · </span>)
          first = false
          if (!state) {
            parts.push(<span style={{ fg: context.theme.text.muted }}>{`${LABEL[id]} ${pending ? "…" : "?"}`}</span>)
            continue
          }
          const stale = id === "ci" || id === "mr" ? ` ${ago(state.checkedAt)}` : ""
          parts.push(<span style={{ fg: colorFor(state.status) }}>{`${LABEL[id]} ${GLYPH[state.status]}${stale}`}</span>)
        }
        return <text fg={context.theme.text.base}>{parts}</text>
      },
    })

    // Panel: the ci and mr detail views (panel milestone). One contribution,
    // gated on the shared selection name. Inline render only — a component
    // with a layer registered inside its tree breaks the panel's rendering
    // (probe runs 6-7, research/panel-milestone-design.md). The slot's render
    // body runs once and untracked (plugin/render.tsx Slot semantics), so all
    // data reads go through signal accessors inside function children — the
    // only tracked path into a mounted contribution. A view switch remounts
    // the slot (the host's panel Show is keyed on the active target,
    // session-frame.tsx), so the body re-runs with the new name.
    const ciView = () => {
      version() // subscribe: the heartbeat ages the title's staleness label
      const detail = ciDetail()
      const title = `ci — recent runs${detail ? ` (${ago(detail.at)})` : ""}`
      if (!detail) return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>…</text>]
      if (detail.note)
        return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>{`failed to load runs: ${detail.note}`}</text>]
      if (detail.runs.length === 0)
        return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>no runs for this branch</text>]
      return [
        <text fg={context.theme.text.base}>{title}</text>,
        ...detail.runs.map((run) => (
          <text fg={colorFor(run.status)}>{`${GLYPH[run.status]} ${run.title}${run.when ? ` · ${run.when}` : ""}`}</text>
        )),
      ]
    }
    const mrView = () => {
      version() // subscribe: the heartbeat ages the title's staleness label
      const detail = mrDetail()
      const title = `mr — current branch${detail ? ` (${ago(detail.at)})` : ""}`
      if (!detail) return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>…</text>]
      if (detail.note)
        return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>{`failed to load mr: ${detail.note}`}</text>]
      if (!detail.info)
        return [<text fg={context.theme.text.base}>{title}</text>, <text fg={context.theme.text.muted}>no merge request for this branch</text>]
      const info = detail.info
      return [
        <text fg={context.theme.text.base}>{title}</text>,
        <text fg={colorFor(info.status)}>{`${GLYPH[info.status]} ${info.label}${info.title ? ` ${info.title}` : ""}`}</text>,
        ...(info.review ? [<text fg={context.theme.text.muted}>{`review: ${info.review}`}</text>] : []),
        ...(info.url ? [<text fg={context.theme.text.muted}>{info.url}</text>] : []),
      ]
    }
    context.ui.slot({
      append: "session.panel",
      render: (panel) => {
        if (panel.name === "dials.ci") {
          return (
            <box flexDirection="column" paddingLeft={1} paddingTop={1} gap={0}>
              {() => ciView()}
            </box>
          )
        }
        if (panel.name === "dials.mr") {
          return (
            <box flexDirection="column" paddingLeft={1} paddingTop={1} gap={0}>
              {() => mrView()}
            </box>
          )
        }
        return null
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
            onTrigger: async (id) => {
              const widget = id as WidgetId
              await updateSettings((draft: DialsConfig) => {
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
            onTrigger: async (id) => {
              const widget = id as WidgetId
              await updateSettings((draft: DialsConfig) => {
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
              restart(widget)
              context.ui.toast.show({ message: `${widget} refreshed`, variant: "success" })
            },
          },
          {
            bind: "ctrl+h",
            title: "Endpoint",
            onTrigger: (id) => {
              const widget = id as WidgetId
              if (widget !== "vpn") {
                context.ui.toast.show({ message: "endpoint applies to vpn only" })
                return
              }
              void (async () => {
                const answer = await context.ui.dialog.prompt({ title: "vpn endpoint", placeholder: "https://github.com" })
                if (!answer) return
                const url = answer.trim()
                if (!url.startsWith("https://")) {
                  context.ui.toast.show({ message: "endpoint must start with https://" })
                  return
                }
                updateSettings((draft: DialsConfig) => {
                  draft.widgets.vpn.endpoint = url
                }).then(() => {
                  void checkOne("vpn")
                  context.ui.toast.show({ message: "vpn endpoint set", variant: "success" })
                })
              })()
            },
          },
          {
            bind: "ctrl+d",
            title: "Detail",
            onTrigger: (id) => {
              const widget = id as WidgetId
              if (widget !== "ci" && widget !== "mr") {
                context.ui.toast.show({ message: `${LABEL[widget]} has no detail view` })
                return
              }
              const opened = context.ui.panel.open(`dials.${widget}`)
              if (!opened) {
                context.ui.toast.show({ message: "panels need a live session" })
                return
              }
              void loadDetail(widget)
              context.ui.dialog.clear()
            },
          },
          {
            bind: "ctrl+x",
            title: "Reset",
            onTrigger: async (id) => {
              const widget = id as WidgetId
              await updateSettings((draft: DialsConfig) => {
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

    // Close UX (panel milestone): a setup-registered global escape binding.
    // The prompt textarea holds focus normally, so a global layer fires from
    // anywhere; while a panel is open the host's box has focus and prompt
    // keystrokes do not arrive — this binding is the close path. Returns
    // false (continue keyboard dispatch) when no panel is open so dialogs
    // keep their own escape handling.
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          bind: "escape",
          run: () => {
            const current = context.ui.panel.current()
            if (!current) return false
            context.ui.panel.close()
            return undefined
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
