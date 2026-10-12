# opencode-plugins

Small OpenCode TUI (CLI) plugins, built with the maintainer-endorsed slot API.

## Packages

### version-footer — `packages/version-footer`

Shows the harness version in the in-session footer status row
(`prompt.footer.status`) — e.g. `v2.0.27`. The session footer has no
built-in version display; the home footer hides its version below 64
columns. ~15 lines. See [packages/version-footer](packages/version-footer).

### dials — `packages/dials`

Ambient status segments for the footer: vault lock state (`bw`), VPN
reachability, CI pipeline (GitHub Actions via `gh`, GitLab via `glab`),
and the current branch's MR state. Data comes from local CLIs the user
already authenticated — the plugin holds no credentials. Per-widget
surface config (footer | panel | both | off), `/dials` to configure,
`/dials-refresh` to re-check. See [packages/dials](packages/dials).

## Trust posture

These plugins perform **no telemetry** and hold **no credentials** —
they render harness state and shell out to CLIs the user configured.
Read each package's source; that is the whole plugin.

## Loading (local)

Clone the repo anywhere, then point `cli.json` at the package paths:

```json
{
  "plugins": [
    "/path/to/opencode-plugins/packages/version-footer",
    "/path/to/opencode-plugins/packages/dials"
  ]
}
```

Reference: https://opencode.ai/v2/docs/cli/plugins

## Prior art

- `research/prior-art.md` — the version footer niche (2026-10-12)
- `research/prior-art-status-and-panel.md` — status-footer and
  sidebar/panel lanes, upstream demand, name collisions (2026-10-12)
