/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { DEFAULTS, fromOptions, lastUserText, renderLine, type LastPromptConfig } from "./lib.ts"

// lastprompt: the session's last user prompt in the session sidebar,
// one or two lines under the built-in rows.
//
// Data: context.data.session.message.list(sessionID) is the host's own
// transcript store (solid, event-published). A submitted prompt
// repaints the row without a poller, and the plugin makes no API calls
// of its own. The host seeds a session's message window with its
// newest 20 rows, so on mount the plugin pages one older batch if
// more exist: in a long agent turn the last user prompt can sit past
// the window. If it is still absent after one batch (very long
// sessions), the row shows nothing until the host pages more on
// scroll.
//
// The slot's input carries the sessionID for the session view that
// owns the sidebar, so each tab shows its own last prompt.
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
    const cfg = (): LastPromptConfig => fromOptions(settings)

    const slot = context.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        const sessionID = input.sessionID
        // The render body runs once per mount (untracked): the right
        // place for the one-time window page-in. Outside the tracked
        // child so a render pass stays side-effect free.
        if (context.data.session.message.more(sessionID)) {
          void context.data.session.message.loadMore(sessionID)
        }
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
      // The shape every dialog action shares: apply the change, toast
      // the result (read after the write, so it reflects the new
      // value), and close the dialog.
      function apply(mutate: (draft: LastPromptConfig) => void, toast: () => { message: string; variant?: "success" }) {
        return () => {
          void (async () => {
            await updateSettings(mutate)
            context.ui.toast.show(toast())
            context.ui.dialog.clear()
          })()
        }
      }
      void context.ui.dialog.select({
        title: "Last prompt",
        options: [
          {
            title: `surface: ${c.surface}`,
            value: "surface",
            category: "Display",
            description: "sidebar shows the row, off hides it",
          },
          {
            title: `lines: ${c.lines}`,
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
            onTrigger: apply(
              (draft) => {
                draft.surface = draft.surface === "off" ? "sidebar" : "off"
              },
              () => ({ message: `surface → ${cfg().surface}` }),
            ),
          },
          {
            bind: "ctrl+l",
            title: "Lines",
            selection: "none",
            onTrigger: apply(
              (draft) => {
                draft.lines = draft.lines === 1 ? 2 : 1
              },
              () => ({ message: `lines → ${cfg().lines}` }),
            ),
          },
          {
            bind: "ctrl+x",
            title: "Reset",
            selection: "none",
            onTrigger: apply(
              (draft) => {
                draft.surface = DEFAULTS.surface
                draft.lines = DEFAULTS.lines
              },
              () => ({ message: "reset to defaults", variant: "success" }),
            ),
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
