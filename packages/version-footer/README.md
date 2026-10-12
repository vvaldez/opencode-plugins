# @vvaldez/opencode-version-footer

Small OpenCode TUI (CLI) plugin that shows the harness version in the
in-session footer status row (`prompt.footer.status`) — e.g. `v2.0.27`.

The session footer has no built-in version display (verified in OpenCode
2.0.27 source), and the home footer hides its version below 64 columns.
This plugin closes that gap in ~15 lines using the maintainer-endorsed
slot API.

## Trust posture

The plugin performs **no network calls, no filesystem access, no shell
execution, and collects no telemetry** — it only registers a footer slot
rendering `context.app.version`. Read `tui.tsx`; that is the whole plugin.

## Files

- `tui.tsx` — the TUI plugin: appends a version slot to `prompt.footer.status`
- `index.ts` — main plugin stub (`./` export; required for package loading)
- `package.json` — package metadata; `./tui` export, OpenTUI peers

Prior-art research lives at the repo root: `research/prior-art.md`.

## Loading (local)

This package lives inside the [plugin collection](../../README.md). Clone
the collection repo anywhere, then point `cli.json` at the **package
directory** — the repo root is a workspaces manifest and loads nothing:

```json
{
  "plugins": [
    "/path/to/opencode-plugins/packages/version-footer"
  ]
}
```

Reference: https://opencode.ai/v2/docs/cli/plugins

## Notes

- Verified working on OpenCode 2.0.27.
- `@opencode/plugin` is pinned to the exact version verified against that
  harness era — the official template uses `latest`; pinned deliberately.
- `private: true` is intentional: npm publish is not used — the
  `cli.json` path entry above is the documented zero-install route.
- Upstream PR #52764 (open, unmerged) would add a configurable statusline
  including version; if it lands, this plugin may become redundant.
