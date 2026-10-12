# opencode-version-plugin

Small OpenCode CLI (TUI) plugin that shows the harness version in the
in-session footer status row (`prompt.footer.status`) — e.g. `v2.0.27`.

Local-only for now (private repo). If published later, it is installable as a
CLI-only plugin package (`./tui` export beside the main plugin).

## Files

- `tui.tsx` — the TUI plugin: appends a version slot to `prompt.footer.status`
- `index.ts` — main plugin stub (`./` export; required for package loading)
- `package.json` — package metadata; `./tui` export, OpenTUI peers

Entry files sit at the package root (discovery-layout shape). Verified
loading on OpenCode 2.0.27: the `plugins` cli.json entry must use the
**string form** for a local path — the object form
(`{"package": "/abs/path"}`) is schema-valid but is silently not loaded.

## Loading (local)

Clone the repo anywhere, then point `cli.json` at the clone path:

```json
{
  "plugins": [
    "/path/to/opencode-plugins"
  ]
}
```

Reference: https://opencode.ai/v2/docs/cli/plugins
