# Panel milestone design — dials v2

Grilled 2026-10-13 and de-risked with a live probe (8 runs, throwaway plugin
in a temp project). Every API claim below was verified against opencode v2
2.0.27 on this machine unless it carries an upstream source link. Companion to
[prior-art-status-and-panel.md](prior-art-status-and-panel.md).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Todos | Sidebar row (`sidebar.content`) + full list as a panel view | #42421 is a glance demand — the row serves it ambiently (visible whenever no panel is open); the panel serves depth. Matches the v1 ambient+detail pattern |
| Detail views | Todos (full list), CI (recent runs: status, duration, title), MR (state, review decision, link) | Real depth + data sources already exist in v1 (`glab ci list -F json` / `glab mr list -F json`). Vault/VPN are one-line facts — no depth |
| Panel architecture | One contribution rendering per selected name (`dials.todos`, `dials.ci`, `dials.mr`) | Names are shared selection values (upstream docs); one slot, per-view gating |
| Open trigger | Detail action (ctrl+d) in the existing `/dials` dialog | One entry point, uniform across the three views, consistent with v1's ctrl+s/e/r/h/x |
| Close | Setup-registered **global** escape binding | Closes when a panel is open (`return undefined`), continues dispatch otherwise (`return false`). Verified live — see the probe findings |
| Colors | Native `text.feedback` tokens | ok→`feedback.success.base`, warn→`feedback.warning.base`, fail→`feedback.error.base`, unknown→`text.muted`. Theme-aware (light/dark), small diff. The v1 probe's "no status tokens" note is outdated — `FeedbackKind` exists in theme 2.0.28 |
| Surface setting | Stays `footer \| off` | The panel is a detail surface, not an ambient one; detail views are available for all three widgets via the dialog regardless of surface. A shared panel overview would duplicate the footer |

## Verified API facts

### Rendering

- `session.panel` contributions render: `context.ui.slot({ append: "session.panel", render: (panel) => <Show when={panel.name === "dials.ci"}>... })`, opened via `context.ui.panel.open(name)`.
- **Inline slot render only.** A separate component with a keymap layer registered inside its tree (onMount, inside the host's InteractivityProvider) breaks the panel's rendering — the panel stays selected and focused but its content never paints. Two runs confirmed (global-mode and targeted layers). Do not register layers from inside the panel's component tree.
- `panel.open` returns `false` outside a session. A fresh TUI has no session until the first message — the open path needs a session to exist (the dialog action satisfies this: a panel is only openable from a live session view).

### Close UX (the blocker, resolved)

- The focused panel's host box (`id=session-panel`) takes keyboard focus on open — the prompt textarea loses it. Keystrokes aimed at the prompt (slash commands) do not arrive while a panel is open, and global keymap layers registered from `setup()` do not intercept them.
- A targeted keymap layer (`target`, `targetMode: "focus"`) only fires when the target **is** the focused renderable (`@opentui/keymap` `TargetMode = "focus" | "focus-within"`). Focus belongs to the host's box, not the contribution's — so contribution-scoped targets never fire. `focus-within` cannot help either: the host box is the contribution's *ancestor*, not descendant.
- **The working pattern:** a setup-registered global escape binding (same shape as the working `/dials` command layer). The prompt textarea holds focus normally, so a global layer fires from anywhere. run() closes the panel when `context.ui.panel.current()` is set and returns `undefined`; otherwise returns `false` to continue keyboard dispatch (the host keeps its own escape handling for dialogs).
- Verified end to end: open → focus moves to `session-panel` → escape fires globally → panel closes → focus returns to the prompt (`textarea-2`), sidebar restored.

### Panel vs sidebar (upstream #48519)

- An open panel **replaces the sidebar** — plugin `sidebar.content`/`sidebar.footer` slots and the built-in rows all vanish while a panel is open, and return on close. This is focus-mode semantics, not a bug to avoid: the panel is the right side of the session view while selected.
- `panel.close()` restores the sidebar. Full open→close→open cycle verified.

### Focus flow (introspected live via `renderer.currentFocusedRenderable`)

```
prompt textarea (textarea-1)  →  session-panel (on open)  →  textarea-2 (on close)
```

### Geometry

- At a 160-column terminal the panel splits at width 80 (half), `presentation="panel"`, `focused=true`.
- Upstream tests: `canSplit()` requires width > 80 — at ≤80 columns the panel forces fullscreen regardless of the user's presentation choice.

### Diagnostics

- `console.error` from TUI plugins never reaches `~/.local/share/opencode/log/`. File-based logging (`node:fs` append) is the only channel for plugin diagnostics — the probe used it for every assertion.
- `pyte` replay of pty captures reconstructs frames (install with `pip3 install --user pyte`); marker greps on raw bytes are the reliable signal, pyte frames are noisy for OpenTUI's differential updates.

## Upstream references

- PR [#47150](https://github.com/anomalyco/opencode/pull/47150) — plugin-owned session panels (merged 2026-09-04): `PanelInput` contract, `ui.panel.open/close/current`, `panel-host.tsx`, geometry tests
- Issue [#48519](https://github.com/anomalyco/opencode/issues/48519) — "session.panel hides the sidebar": confirmed live; focus-mode semantics, sidebar restored on close
- Issue [#42421](https://github.com/anomalyco/opencode/issues/42421) — todos restoration (open): the demand this milestone serves
- PR [#47152](https://github.com/anomalyco/opencode/pull/47152) — diffs in panel slots (open): may shape what the panel API allows; watch before building
- `@opencode/theme` 2.0.28 — `text.feedback.{success,warning,error,info}.{base,muted}`, `FeedbackKind` = error/warning/success/info

## Build plan (follow-up)

1. Todos: `sidebar.content` row (count + current item) reading session data — no CLI calls
2. Panel contribution: inline render, three views gated on `panel.name`
3. Dialog: Detail action (ctrl+d) → `panel.open("dials.<widget>")`
4. Escape binding: setup-registered global layer, closes when a panel is open
5. Colors: `text.feedback` tokens on footer glyphs + panel content
6. Tests: lib-level (classify/parse) + a pty smoke (markers + focus assertions)
