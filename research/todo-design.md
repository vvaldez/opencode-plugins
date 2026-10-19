# todo design

Grilled 2026-10-18 and verified against opencode 2.0.27 (plugin SDK
types from the live `@opencode/plugin` package, upstream source, and a
pty smoke). Companion to [lastprompt-design.md](lastprompt-design.md)
and [../docs/adr/0001-todos-file-store.md](../docs/adr/0001-todos-file-store.md).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source of truth | User-level file `~/.config/opencode/todos.json` | The only seam serving all three writers: the /todo dialog, the /todo-sync skill running in an agent session, and hand edits. A skill cannot write plugin storage; the host API has no todo data |
| Keying | By sessionID, never auto-pruned | sessionIDs are stable across TUI restarts; orphaned lists linger until cleared (accepted for simplicity) |
| Scope | Per-session | Each session tab shows its own list; the slot input carries the session view's sessionID |
| Home | Separate package `todo` | Independent config and publication path; filed issue #3 (dials todos row/panel) closed as superseded |
| Generation | `/todo-sync` skill + `/todo` dialog | The plugin cannot run an agent; the skill extracts work items from the conversation and writes the current session's list via `OPENCODE_SESSION_ID` |
| Surface | `sidebar.content` list block | Open-count header plus up to six one-line items; `sidebar.footer` compact row deferred |
| Publication | Build first | No ecosystem-listing artifacts in this change |
| Find vs build | Build | aiev/opencode-todolist registers agent tools (a large trust surface) and lacks the skill path; read for ideas, not installed |

## Verified API facts

- `context.ui.dialog.prompt({ title, placeholder })` returns
  `Promise<string | undefined>`: the add path (`packages/plugin/src/tui/context.ts`).
- `dialog.select` actions with `selection: "required"` receive the
  selected value; triggering an action does not close the dialog, so
  the delete action clears and reopens.
- `KeymapCommand.slash: { name, arguments: true }` was verified NOT to
  fire `run` on enter: the raw-input path dispatches elsewhere (a
  proof-file probe, 2026-10-19). `/todo` therefore always opens the
  dialog and the add path is the dialog's text prompt.
- The TUI instantiates a plugin module more than once per process
  (verified with per-instance IDs: the command dispatch lands on an
  instance whose slot never mounted). State shared between the slot
  and the keymap must live in `context.storage`, the host-owned store
  both instances read (the lastprompt pattern), not in setup-scope
  closures.
- The current-session source: `context.ui.tabs.list()` returns `[]`
  even with tabs enabled, and the context exposes no current-session
  accessor outside the slot input. The slot's mount-time session
  capture, shared via storage, is the fallback.
- The plugin polls the file on a fixed cadence (2s) into a shared
  signal (dials pattern); the slot reads it inside a JSX function
  child, the only tracked path into a mounted contribution.
- The host fixes the session sidebar at 42 columns
  (`SESSION_SIDEBAR_WIDTH`, upstream `packages/tui/src/ui/layout.ts`);
  the item text budget is 38 (two-character glyph prefix plus margin).
- The sidebar (`routes/session/sidebar.tsx`) renders only in the
  session route: a fresh TUI shows no sidebar until the session has
  activity. The pty smoke enters it with a one-word message first.

## Prior art

- Upstream #42421 (todo support for v2): v1's `todowrite`/`todoread`
  removed deliberately ("it slows agent down"); a re-enable may come.
  This plugin stays display-only and injects nothing into agent
  context, sidestepping that cost.
- Upstream #5971 documents the sidebar slots.
- aiev/opencode-todolist (closest community prior art): re-registers
  the v1 tools, injects open todos into context, renders a sidebar
  strip. Not installed: agent-tool registration is a much larger trust
  surface than a display-only plugin.
- sachahjkl/opencode-backlog and afriemann/opencode-todo: further
  community alternatives, none on the official ecosystem list.

## Verification

- `bun test packages/todo/test/`: 13 pass (95 across all packages).
- 5-check pty smoke (pyte, 160x50, throwaway project, real HOME with
  the todos file snapshotted and restored around the run): tui boots;
  the session route activates; `/todo` opens the dialog; the dialog's
  text prompt adds "buy milk"; the sidebar block shows the header and
  the item; the todos file carries the item under the session's key.
  Cross-session correctness is verified in the same run: a todo
  written under one session's key does not render in another
  session's sidebar (per-session keying).
