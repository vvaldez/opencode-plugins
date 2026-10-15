# lastprompt design

Grilled 2026-10-15 and verified against opencode 2.0.27 (plugin SDK
types from `@opencode/plugin` / `@opencode/client` on npm, upstream
`packages/tui` source, and a live pty smoke). Companion to
[panel-milestone-design.md](panel-milestone-design.md).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Home | Separate package `lastprompt` | Not a dials row: session context display is a different concern from session instrumentation; independent config surface and publication path; isolation from upstream slot-API churn |
| Defaults | On once installed, `lines: 1` | Installing the plugin is the opt-in; one truncated line is the #28035 space lesson |
| Data | Reactive host store read | `context.data.session.message.list(sessionID)` is the host's solid transcript store; no plugin-initiated API calls, no poller |
| Publication | Build first | No ecosystem listing artifacts in this change; prior art cited in the README instead |

## Verified API facts

- Slot `sidebar.content` publishes the input `{ sessionID }`, passed
  reactively (`SlotMap` in `@opencode/plugin` `tui/context.d.ts`:
  "render receives the target slot's input, reactively"). The sidebar
  belongs to the session view, so a tab switch remounts the slot with
  the new session's input. Per-tab behavior is architectural.
- `context.data.session.message.list(sessionID)` returns
  `SessionMessageInfo[]` from a solid store (the `@opencode/client`
  solid data layer publishes per-session stores, event-updated). The
  read sits inside a JSX function child: the only tracked path into a
  mounted slot contribution (panel-milestone lesson).
- `SessionMessageUser` rows carry `text: string` directly; no part
  parsing needed. `type: "user"` is the discriminator.
- The host seeds a session's message window with its newest 20 rows
  (`messagePageLimit`, `@opencode/client` solid data layer). On mount
  the plugin pages one older batch when `more(sessionID)` is true, so
  the last user prompt in a long agent turn is found. Beyond one batch
  (very long sessions) the row shows nothing until the host pages more
  on scroll. Documented in tui.tsx.
- The session sidebar is fixed at 42 columns
  (`SESSION_SIDEBAR_WIDTH`, upstream `packages/tui/src/ui/layout.ts`).
  The row budget is 36 chars for one line and 72 for two: the width
  minus the `last ` prefix and a margin. A one-line row stays one line.

## Upstream references

- Issue #28035 (sticky last prompt) closed NOT_PLANNED; maintainer:
  "I'd prefer extending the session view with a slot so a plugin can do
  that." This plugin is that slot path.
- Issue #32165 (TUI quick-jump sidebar) closed as duplicate; #33130
  (history panel in sidebar) closed as duplicate; the sidebar-history
  and sticky-prompt PRs (#33127, #45158, #29070, #29086) never merged.
- The desktop app (packages/app) surfaces session summaries and a
  hover preview over user messages; the TUI had nothing.
- PR #47152 (open, diffs in panel/slot APIs) may reshape the slot
  surface; watch before any ecosystem publication.

## Verification

- `bun test packages/lastprompt/test/`: 14 pass.
- 4-check pty smoke (pyte, 160x50, throwaway project): tui boots;
  live session created; sidebar row shows the last prompt (marker
  prompt, `last ` prefix distinguishes the row from the transcript
  copy of the same text); row repaints on the next prompt (store
  reactivity, no poller).
