/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { DEFAULTS, fromOptions, fromStorage, lastUserText, renderLine, type LastPromptConfig } from "./lib.ts"

// lastprompt — the session's last user prompt in the session sidebar,
// one or two lines under the built-in rows.
//
// Data: context.data.session.message.list(sessionID) is the host's own
// transcript store (solid, event-published). A submitted prompt
// repaints the row without a poller, and the plugin makes no API calls
// of its own. The slot's input carries the sessionID for the session
// view that owns the sidebar, so each tab shows its own last prompt.
//
// Repaint model (dials lesson, research/panel-milestone-design.md):
// the slot render body runs once, untracked. The read happens inside a
// JSX function child, the only tracked path into a mounted
// contribution. The sidebar belongs to the session view, so a tab
// switch remounts it with the new session's input.
//
// Trust boundary (lib.ts): options are display-only. A hostile project
// config can at most flip the surface to off or widen the row to two
// lines.

export default Plugin.define({
  id: "vvaldez.lastprompt.tui",
  setup(context) {
    const options = context.options as Partial<LastPromptConfig> | undefined
    const [settings, updateSettings] = context.storage.store("settings", { initial: fromOptions(options) })
    const cfg = (): LastPromptConfig => fromStorage(settings)

    const slot = context.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        const sessionID = input.sessionID
        return (
          <box>
            {() => {
              const c = cfg()
              if (c.surface === "off") return null
              const text = lastUserText(context.data.session.message.list(sessionID))
              if (!text) return null
              return <text fg={context.theme.text.muted}>{`last ${renderLine(text, c.lines)}`}</text>
            }}
          </box>
        )
      },
    })

    function openConfig() {
      const c = cfg()
      void context.ui.dialog.select({
        title: "Last prompt",
        options: [
          {
            title: `surface — ${c.surface}`,
            value: "surface",
            category: "Display",
            description: "sidebar shows the row, off hides it",
          },
          {
            title: `lines — ${c.lines}`,
            value: "lines",
            category: "Display",
            description: "1 or 2 lines, the host wraps at the sidebar width",
          },
        ],
        actions: [
          {
            bind: "ctrl+s",
            title: "Surface",
            selection: "none",
            onTrigger: () => {
              void (async () => {
                await updateSettings((draft: LastPromptConfig) => {
                  draft.surface = draft.surface === "off" ? "sidebar" : "off"
                })
                context.ui.toast.show({ message: `surface → ${cfg().surface}` })
                context.ui.dialog.clear()
              })()
            },
          },
          {
            bind: "ctrl+l",
            title: "Lines",
            selection: "none",
            onTrigger: () => {
              void (async () => {
                await updateSettings((draft: LastPromptConfig) => {
                  draft.lines = draft.lines === 1 ? 2 : 1
                })
                context.ui.toast.show({ message: `lines → ${cfg().lines}` })
                context.ui.dialog.clear()
              })()
            },
          },
          {
            bind: "ctrl+x",
            title: "Reset",
            selection: "none",
            onTrigger: () => {
              void (async () => {
                await updateSettings((draft: LastPromptConfig) => {
                  draft.surface = DEFAULTS.surface
                  draft.lines = DEFAULTS.lines
                })
                context.ui.toast.show({ message: "reset to defaults", variant: "success" })
                context.ui.dialog.clear()
              })()
            },
          },
        ],
      })
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "vvaldez.lastprompt.configure",
          title: "Configure last prompt row",
          group: "Last prompt",
          slash: { name: "lastprompt" },
          palette: true,
          run: () => openConfig(),
        },
      ],
    }))

    return () => {
      if (typeof slot === "function") (slot as unknown as () => void)()
    }
  },
})