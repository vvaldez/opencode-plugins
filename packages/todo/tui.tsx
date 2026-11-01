/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { TextAttributes } from "@opentui/core"
import { createSignal } from "solid-js"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  DIALOG_BUDGET,
  EMPTY,
  addItem,
  fromFile,
  fromOptions,
  headerLine,
  itemLine,
  itemsFor,
  removeItem,
  toggleItem,
  visibleItems,
  type Style,
  type TodoFile,
  type TodoItem,
} from "./lib.ts"

// todo: the current session's work-tracking todos in the session
// sidebar, one block under the built-in rows.
//
// Data: one user-owned file (~/.config/opencode/todos.json), keyed by
// sessionID (ADR-0001). The plugin polls the file on a fixed cadence
// (dials pattern) into a shared signal; the slot reads it inside a JSX
// function child, the only tracked path into a mounted contribution
// (dials lesson, research/panel-milestone-design.md). A session with no
// todos renders nothing, so the sidebar stays clean.
//
// Rows: open items first, then done items (checked, struck through)
// filling the leftover cap space. Glyphs are ☐/☑ by default, "bullet"
// (•/✓) as the toggle-back — settable via the /todo dialog (ctrl+s) or
// plugin options (the lastprompt pattern: context.options through an
// allow-list read into context.storage).
//
// Interaction: each row's onMouseUp toggles done in place (opentui
// fires pointer events on any primitive; host precedent
// message-parts.tsx). Click works only in mouse-enabled terminals —
// the /todo dialog (enter toggles, ctrl+x deletes, ctrl+a clears)
// stays the non-mouse path. Delete/clear keep their dialog
// confirmation flows; a bare click never destroys.
//
// Writes: the /todo dialog (add via dialog.prompt, curate via select
// actions, click-to-toggle) and the /todo-sync skill both write the
// same file. The add path is the dialog's text prompt (arguments: true
// was verified NOT to fire run on enter; the raw-input path dispatches
// elsewhere).
//
// Per-session scope: the slot input carries the session view's
// sessionID, so each tab shows its own list. The plugin is
// instantiated more than once per TUI (verified 2026-10-19: the
// command dispatch lands on an instance whose slot never mounted), so
// the slot's session capture is shared through context.storage, the
// host-owned store both instances read (the lastprompt pattern).
//
// Trust boundary: see lib.ts (allow-list read, no execution). No
// network, no shell, no agent tools.

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const TODO_PATH = join(CONFIG_DIR, "todos.json")
const POLL_MS = 2000

function readFile(): TodoFile {
  try {
    if (!existsSync(TODO_PATH)) return EMPTY
    return fromFile(JSON.parse(readFileSync(TODO_PATH, "utf8")))
  } catch {
    // a stale or hostile file reads as empty, not a crash
    return EMPTY
  }
}

function writeFile(file: TodoFile): boolean {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    try {
      // a symlinked todos.json would clobber its target; refuse it
      if (lstatSync(TODO_PATH).isSymbolicLink()) return false
    } catch {
      // ENOENT: the first write creates it
    }
    writeFileSync(TODO_PATH, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
    // mode applies only at creation; a pre-existing loose file stays
    // loose without this
    chmodSync(TODO_PATH, 0o600)
    return true
  } catch {
    return false
  }
}

type ViewStore = { sid?: string }

export default Plugin.define({
  id: "vvaldez.todo.tui",
  setup(context) {
    const [file, setFile] = createSignal<TodoFile>(readFile())

    // Repaint only on content change: the poller re-reads the file
    // every cycle, and a fresh object with identical content must not
    // re-fire the signal.
    let snapshot = JSON.stringify(readFile())
    function refresh(): void {
      const next = readFile()
      const nextSnapshot = JSON.stringify(next)
      if (nextSnapshot === snapshot) return
      snapshot = nextSnapshot
      setFile(next)
    }
    const timer = setInterval(refresh, POLL_MS)

    // Shared across the plugin's instances (the TUI instantiates this
    // module more than once): the slot's session capture, the keymap
    // dialog's current-session fallback, and the glyph style all live
    // here. Style reads context.options through the allow-list read
    // (the lastprompt pattern) and is re-validated on every read.
    const [view, updateView] = context.storage.store("view", { initial: { sid: undefined } as ViewStore })
    const [styleStore, updateStyle] = context.storage.store("style", { initial: fromOptions(context.options) })
    const style = (): Style => fromOptions(styleStore).style

    // The active root-session tab is the current session when tabs
    // have entries; otherwise the slot capture shared via storage.
    const currentSession = (): string | undefined => {
      const active = context.ui.tabs.list().find((tab) => tab.active)?.sessionID
      return active ?? view.sid
    }

    function sessionOrToast(): string | undefined {
      const sid = currentSession()
      if (sid === undefined) {
        context.ui.toast.show({ message: "todo: start a conversation first", variant: "warning" })
      }
      return sid
    }

    function save(mutate: (items: TodoItem[]) => TodoItem[]): void {
      const sid = sessionOrToast()
      if (sid === undefined) return
      // fresh read: the poller signal may lag an action
      const current = readFile()
      const items = mutate(itemsFor(current, sid))
      const ok = writeFile({ ...current, sessions: { ...current.sessions, [sid]: items } })
      if (!ok) {
        context.ui.toast.show({ message: "todo: write failed", variant: "warning" })
        return
      }
      refresh()
    }

    // Click-to-toggle from the sidebar: the slot's sessionID is
    // authoritative (the row is mounted in that session's view), so no
    // session resolution or toast — just a fresh read, the write, and
    // a failed-write toast.
    function toggleInPlace(sessionID: string, id: string): void {
      const current = readFile()
      const items = toggleItem(itemsFor(current, sessionID), id)
      const ok = writeFile({ ...current, sessions: { ...current.sessions, [sessionID]: items } })
      if (!ok) {
        context.ui.toast.show({ message: "todo: write failed", variant: "warning" })
        return
      }
      refresh()
    }

    type Pick = { kind: "add" } | { kind: "item"; id: string }

    function openTodo(): void {
      const sid = sessionOrToast()
      if (sid === undefined) return
      // fresh read: the poller signal may lag a click
      const items = itemsFor(readFile(), sid)
      void context.ui.dialog
        .select<Pick>({
          title: headerLine(items),
          placeholder: "this session only",
          options: [
            {
              title: "+ add a todo",
              value: { kind: "add" },
              category: "Manage",
              description: "prompt for new item text, saved for this session only",
            },
            ...items.map((item) => ({
              title: itemLine(item, style(), DIALOG_BUDGET),
              value: { kind: "item", id: item.id },
              category: item.done ? "Done" : "Open",
              description: "enter toggles done",
            })),
          ],
          actions: [
            {
              bind: "ctrl+d",
              title: "Toggle done",
              selection: "required",
              onTrigger: (value) => {
                if (value.kind !== "item") {
                  context.ui.toast.show({ message: "todo: select a todo first" })
                  return
                }
                save((list) => toggleItem(list, value.id))
                context.ui.dialog.clear()
                openTodo()
              },
            },
            {
              bind: "ctrl+s",
              title: "Glyphs",
              selection: "none",
              onTrigger: () => {
                updateStyle((draft) => {
                  draft.style = draft.style === "bullet" ? "checkbox" : "bullet"
                })
                context.ui.toast.show({ message: `glyphs → ${style()}` })
                // re-open so the item titles pick up the new glyphs
                // (same flow the ctrl+d/ctrl+x actions use)
                context.ui.dialog.clear()
                openTodo()
              },
            },
            {
              bind: "ctrl+x",
              title: "Delete",
              selection: "required",
              onTrigger: (value) => {
                if (value.kind !== "item") {
                  context.ui.toast.show({ message: "todo: select a todo first" })
                  return
                }
                save((list) => removeItem(list, value.id))
                context.ui.dialog.clear()
                openTodo()
              },
            },
            {
              bind: "ctrl+a",
              title: "Clear session",
              selection: "none",
              onTrigger: () => {
                void context.ui.dialog
                  .confirm({
                    title: "Clear todos",
                    message: "Clear every todo in this session?",
                    label: { confirm: "Clear", cancel: "Keep" },
                  })
                  .then((ok) => {
                    if (ok) save(() => [])
                    else openTodo()
                  })
                  .catch(() => {})
              },
            },
          ],
        })
        .then((value) => {
          if (!value) return
          if (value.kind === "add") {
            void context.ui.dialog
              .prompt({
                title: "New todo",
                description: "saved for this session only",
                placeholder: "what are we working on",
              })
              .then((text) => {
                if (!text) return
                save((list) => addItem(list, text))
              })
              .catch(() => {})
            return
          }
          save((list) => toggleItem(list, value.id))
        })
        .catch(() => {})
    }

    const slot = context.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        const sessionID = input.sessionID
        // Mount-time capture (runs once per mount): feeds the global
        // keymap dialog's current-session fallback through storage.
        updateView((draft) => {
          draft.sid = sessionID
        })
        return (
          <box>
            {() => {
              const items = itemsFor(file(), sessionID)
              if (items.length === 0) return null
              const glyphs = style()
              return (
                <box>
                  <text fg={context.theme.text.muted}>{headerLine(items)}</text>
                  {visibleItems(items).map((item) => (
                    <text
                      fg={context.theme.text.muted}
                      attributes={item.done ? TextAttributes.STRIKETHROUGH : undefined}
                      onMouseUp={() => toggleInPlace(sessionID, item.id)}
                    >
                      {itemLine(item, glyphs)}
                    </text>
                  ))}
                </box>
              )
            }}
          </box>
        )
      },
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "vvaldez.todo.manage",
          title: "Session todos",
          group: "Todo",
          slash: { name: "todo", aliases: ["todos"] },
          palette: true,
          run: () => {
            openTodo()
          },
        },
      ],
    }))

    return () => {
      clearInterval(timer)
      if (typeof slot === "function") (slot as unknown as () => void)()
    }
  },
})
