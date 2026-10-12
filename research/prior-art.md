# Prior Art: OpenCode TUI footer version plugin

Researched 2026-10-12 against primary sources (GitHub API, npm registry, official docs, upstream source). Every claim carries its source URL.

## Verdict (summary)

- **No existing plugin displays the OpenCode version in the TUI session footer.** The closest overlaps are a configurable statusline plugin whose `version` segment shows *its own* version, and an unmerged upstream PR that would let a shell script show any status (including version) in the prompt footer.
- **The plugin's premise is verified in upstream source**: the home footer renders `context.app.version` (only when terminal width ≥ 64), and the in-session prompt footer's built-in content shows spinner/interrupt status and the working-directory label — no version anywhere.
- **Distribution convention is npm** (`opencode-*` / `@scope/opencode-*` packages with a `./tui` export), with plugin discovery directories (`<global-config>/plugins/<name>/`, `<project>/.opencode/plugins/<name>/`) as the documented zero-install route for local plugins.
- **Upstream demand for footer/status customization is real and current** (an open feature request + an open PR for a Claude Code-style statusline, both from July–October 2026; a maintainer closed the "persistent footer status" issue as *completed* by pointing at the V2 footer slots). But **no issue specifically asks for a version display in the TUI** — that request does not exist upstream yet.
- **Recommendation: publish.** It fills a verified, unfilled niche with ~15 lines; the main risk (upstream PR #52764 merging and making it a config option) is speculative and unmerged.

---

## 1. Prior art: existing plugins in this space

### Nothing found that shows the OpenCode version in the session footer

Searched: GitHub topic `opencode-plugin` (1,152 repos), npm registry search for `opencode plugin` / `opencode-statusline` / `opencode plugin statusline`, the `awesome-opencode` curated list, and the official OpenCode ecosystem page. No candidate renders the OpenCode/harness version in the TUI footer or statusline.

Sources:
- GitHub topic search (1,152 results, none version-display): https://api.github.com/search/repositories?q=topic:opencode-plugin
- npm search: https://registry.npmjs.org/-/v1/search?text=opencode%20plugin
- awesome-opencode list: https://github.com/awesome-opencode/awesome-opencode
- official ecosystem page: https://opencode.ai/docs/ecosystem

### Closest candidates (what they do, and where they stop)

**Subagent Monitor** — `opencode-subagent-statusline` (npm), MIT, 230 stars.
TUI sidebar plugin making running/completed/failed subagents visible with elapsed time and token/context usage; "When subagent activity is active, the plugin also adds a compact summary to the home/footer area." Ships `./tui` export. No version display; purpose is subagent visibility.
- https://github.com/Joaquinvesapa/sub-agent-statusline
- https://www.npmjs.com/package/opencode-subagent-statusline

**Cockpit Status** — `@opencode-cockpit/status` (npm), MIT, part of the Cockpit bundle.
A configurable statusline ("declarative segments, a typed module, or your existing Claude Code statusline command") rendering in the sidebar or as a full-width line under the conversation. Its built-in segment table includes `version` — but that is "the bay's version" (Cockpit's own), **not OpenCode's version**. It also offers `text` (literal) and `command` (shell output) segments, so a user *could* show OpenCode's version via `opencode --version`, but there is no built-in OpenCode-version segment and it is a heavy dependency compared to a 15-line plugin.
- https://www.npmjs.com/package/@opencode-cockpit/status
- https://github.com/Codestz/opencode-cockpit
- Built-in segments table (see `version`, `text`, `command` rows): https://cockpit.codestz.dev/status/configuration/
- Narrow-terminal priority discussion mentioning "the version string": https://cockpit.codestz.dev/status/overview/

**opencode-statusline** — npm, MIT.
"OpenCode TUI plugin that displays project and session status in the Sidebar." Sidebar status, not a footer version display. Was added to the official ecosystem plugins list via upstream docs PR.
- https://www.npmjs.com/package/opencode-statusline
- https://github.com/zpershuai/opencode-statusline
- Ecosystem-list PR: https://github.com/anomalyco/opencode/pull/38264

**opencode-statusline-plugins (monorepo)** — quota/usage statusline family by one author.
`opencode-go-statusline` ("display OpenCode Go subscription quota (rolling 5h / weekly / monthly) in the footer statusline. V2-native, zero-config, no cookies"), `opencode-copilot-statusline`, `opencode-kimi-code-statusline`. These are the closest *pattern* match — tiny V2-native plugins appending to the footer statusline — but they show provider quota, not version.
- https://github.com/lnwu/opencode-statusline-plugins
- https://www.npmjs.com/package/opencode-go-statusline
- https://www.npmjs.com/package/opencode-copilot-statusline

**OCometixLine** — `ocometixline` (npm).
"Custom OpenCode statusline with model context limits and icons." Statusline, no version display.
- https://www.npmjs.com/package/ocometixline
- https://github.com/aitingtingya/OCometixLine

**opencode-quotes-plugin** — 16 stars, TypeScript.
"Display inspirational quotes instead of tips" — replaces the home footer's tips row. Footer-adjacent (home footer), no version display. A useful example that small single-purpose footer plugins get listed in awesome-opencode.
- https://github.com/aerovato/opencode-quotes-plugin
- Listing: https://github.com/awesome-opencode/awesome-opencode

**Upstream PR #52764 (OPEN, not merged)** — "feat(tui): add custom statusline command".
Adds a `statusline` option to TUI config: shell command, JSON session state on stdin, first line of stdout shown in the prompt footer. Notably: "It is a built-in TUI plugin that appends to the existing `prompt.footer.status` slot" and "The stdin payload uses Claude Code's statusLine field names so scripts written for it work as they are. Filled in: `session_id`, `cwd`, `version`, `model.id`, `model.display_name`, `workspace.current_...`". If merged, a one-line shell script could show the version — but it is unmerged (opened 2026-10-02) and is config+script, not a zero-config plugin.
- https://github.com/anomalyco/opencode/pull/52764

**Workaround prior art (comment-level)** — `marcusquinn/aidevops` appends status info to the session *title* as a workaround for the lack of a persistent footer surface.
- Comment on #18969: https://github.com/anomalyco/opencode/issues/18969
- The workaround issue: https://github.com/marcusquinn/aidevops/issues/25227

### Verifying the plugin's premise in upstream source

- **Home footer shows the version, conditionally.** `packages/tui/src/feature-plugins/home/footer.tsx` defines `version: width >= 64` (line 11) and renders `{props.context.app.version}` (lines 95–99) after the `home.footer.status` slot. So the home footer shows a version only in terminals ≥ 64 columns.
  https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/feature-plugins/home/footer.tsx
- **Session footer shows no version.** `packages/tui/src/component/prompt/index.tsx` renders the `prompt.footer` slot containing `prompt.footer.status` (spinner + interrupt status, move progress, or the working-directory label) and `prompt.footer.file` — no version text (lines 1876–1958).
  https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/component/prompt/index.tsx
- **Slot vocabulary and `context.version` are real.** `packages/plugin/src/tui/context.ts` types `home.footer`, `home.footer.status`, `prompt.footer`, `prompt.footer.status`, `prompt.footer.file`, `sidebar.footer` (lines 184–201) and `readonly version: string` on the plugin context (line 265).
  https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/tui/context.ts
- Docs confirm the same: slots at `home.footer`, `home.footer.status`, `prompt.footer`, `prompt.footer.status`, etc.; "Status contributions appear after OpenCode's health indicators and before the version" (home footer); `context.app.version` in `setup`.
  https://opencode.ai/v2/docs/build/plugins/cli
  https://opencode.ai/v2/docs/cli/plugins

## 2. Distribution: where OpenCode plugins actually get published

**Dominant convention: npm packages + a GitHub source repo.** The npm registry search returns a dense ecosystem; the recurring shape is:

- Unscoped `opencode-*` or scoped `@scope/opencode-*` package name.
- `"exports"` with `.` (server-side entry) and `./tui` (TUI entry).
- `dependency` on `@opencode/plugin` (or `@opencode-ai/plugin` in V1-era packages) and `peerDependencies` on `@opentui/core`, `@opentui/solid`, `solid-js` when rendering JSX (per the docs' package.json template).
- Many publish via GitHub Actions trusted publishing (npm OIDC) — visible as `trustedPublisher: {id: "github"}` in registry metadata.

Doc template: https://opencode.ai/v2/docs/build/plugins/cli
Examples: https://www.npmjs.com/package/opencode-supermemory · https://www.npmjs.com/package/@langfuse/opencode-observability-plugin · https://www.npmjs.com/package/opencode-models-discovery · https://www.npmjs.com/package/opencode-auto-resume

**Zero-install route for small/local plugins: discovery directories.** Documented layout identical to a published package, loaded automatically:

```
<global-config>/plugins/status/index.ts
<global-config>/plugins/status/tui.ts
<project>/.opencode/plugins/status/index.ts
<project>/.opencode/plugins/status/tui.ts
```

Source: https://opencode.ai/v2/docs/cli/plugins

**Load via config:** `cli.json` `plugins` accepts npm names (`opencode.example@1.0.0`, `@example/opencode-tui`), local paths (`./plugins/status`, `file:///...`), wildcards, and `-` disables. Source: https://opencode.ai/v2/docs/cli/plugins

**Discovery/curation channels (secondary but real):**
- `awesome-opencode` — the community curated list, YAML-driven (`data/plugins/<name>.yaml`: name, repo, tagline, description; schema-validated; PR-based). https://github.com/awesome-opencode/awesome-opencode · https://awesome-opencode-awesome-opencode.mintlify.app/about
- Official ecosystem page on opencode.ai — a Plugins/Projects/Agents directory maintained as `packages/web/src/content/docs/ecosystem.mdx` in the main repo; "Submit a PR." https://opencode.ai/docs/ecosystem
- Monorepos of several small plugins exist (e.g. https://github.com/lnwu/opencode-statusline-plugins with `packages/`; https://github.com/scrylog/scrylog with `packages/opencode-plugin`), but single-purpose standalone repos are more common for tiny plugins.

**Implication for this plugin:** for teammates, the discovery-directory route (`~/.config/opencode/plugins/<name>/` or `<project>/.opencode/plugins/<name>/`) requires no npm at all; a git repo + optional npm publish matches how comparable micro-plugins (e.g. the quota statusline family, quotes plugin) are shared.

## 3. Upstream demand in anomalyco/opencode

**Repo location verified.** The project moved from `sst/opencode` to `anomalyco/opencode` in early 2026 (references updated across the repo; old org archived). 212k stars, default branch `dev`.
- https://github.com/anomalyco/opencode
- Transfer PR: https://github.com/anomalyco/opencode/pull/6920

**Direct footer/statusline customization demand (all cited):**

| Item | State | What it asks |
| --- | --- | --- |
| [#37464](https://github.com/anomalyco/opencode/issues/37464) | **OPEN** (2026-07-17, 3 comments) | "Custom statusLine via shell command (like Claude Code)" — notes "OpenCode's TUI currently renders a fixed footer (model + context) with no user-facing extension point for custom content" |
| [#52764](https://github.com/anomalyco/opencode/pull/52764) | **OPEN PR** (2026-10-02) | Implements #37464: `statusline` shell-command option appending to the existing `prompt.footer.status` slot; payload includes `version` |
| [#46775](https://github.com/anomalyco/opencode/issues/46775) | closed | "TUI: Support custom statusline command (like Claude Code's statusLine config)" |
| [#30295](https://github.com/anomalyco/opencode/issues/30295) | closed | "Custom statusLine via shell script (like Claude Code)" — auto-closed by compliance bot for missing title prefix, re-filed as #37464 |
| [#8619](https://github.com/anomalyco/opencode/issues/8619) | closed | "Native StatusLine Hook for Plugins (Context-Free Display)" (V1 era) |
| [#18969](https://github.com/anomalyco/opencode/issues/18969) | closed as **completed** (2026-10-01, 13 comments) | "add tui.footer.items plugin hook for persistent status display" — maintainer closed pointing at V2 footer slots |
| [#48797](https://github.com/anomalyco/opencode/issues/48797) → [#48798](https://github.com/anomalyco/opencode/pull/48798) | closed / merged | "Allow plugins to add inline home footer status" → "feat(tui): add inline home footer slot" |

The #18969 closure comment is the most load-bearing for this plugin's approach — a maintainer states the sanctioned surface:

> "TUI plugins in OpenCode v2 can show persistent status in footer slots: `prompt.footer`, `prompt.footer.status`, `home.footer` and `home.footer.status`. This replaces using toasts to show ongoing status. Added in #41189; `home.footer.status` came in #48798. Closing as completed."

Source: https://github.com/anomalyco/opencode/issues/18969 (comment by neriousy, 2026-10-01)

**Version-exposure interest (adjacent surface, not the TUI footer):**
- PR #51911 (merged, 2026-09-28): "feat(opencode): expose running version, provider and model in the env block" — https://github.com/anomalyco/opencode/pull/51911
- PR #54566 (OPEN, 2026-10-11): "feat(core): expose the running opencode version in the env block" — https://github.com/anomalyco/opencode/pull/54566

**Explicit absence — what I could NOT find.** After targeted searches (`"opencode version" in:title`, `show version`/`display version`/`version number`, `footer version`, `statusline in:title`, and a manual review of ~40 footer-titled issues/PRs), **no issue or PR specifically requests showing the OpenCode version in the TUI session footer.** Footer-title traffic concerns model/variant labels (#53846, #53638, #40412), tokens-per-second (#46108, #53085), cost aggregation (#39740), clickable labels (#48563), wrapping/spacing bugs (#51563, #50349), and hint toggles (#53610) — not the harness version. Search noise was high (loose keyword matches in the thousands), so the confident statement is: no exact request found; several adjacent, well-supported requests exist.

Adjacent footer-slot demand that overlaps in mechanism (append to footer slots), for completeness:
- #53846 (open): show the turn's model variant in message footers — https://github.com/anomalyco/opencode/issues/53846
- #53638 (open): show the provider and model id in message footers — https://github.com/anomalyco/opencode/issues/53638
- #42929 (open): show the model's context window limit in the TUI (footer and sidebar) — https://github.com/anomalyco/opencode/issues/42929
- PR #51130 (closed): "feat(tui): add local pr-footer plugin showing open PR number" — https://github.com/anomalyco/opencode/pull/51130
- #46268 (open): add a per-assistant-message footer slot to the TUI plugin API — https://github.com/anomalyco/opencode/issues/46268

## 4. Adjacent tools (context only)

**Claude Code** — version display and statusline customization are built-in via config: a `statusLine` option runs a user shell script with JSON session state on stdin, and the payload **includes a `version` field ("Claude Code version")**. There is also a `/statusline` command that generates the script. So for Claude Code, "show the version in the status bar" is a documented, first-class capability.
- https://docs.claude.com/en/docs/claude-code/statusline (see Available data table: `version`)

**Crush (charmbracelet/crush)** — no user-configurable statusline/footer option in its config surface (UI options are limited to `ui compact`, `ui diff`, `ui transparent`, `ui scrollbar`, `ui exit-banner`, etc.). There is an **open** feature request asking for status line customization ([#2648](https://github.com/charmbracelet/crush/issues/2648)). Its header shows cwd, LSP error count, and context percentage — no version. Hooks do receive a `$CRUSH_VERSION` environment variable for version-gating scripts.
- Config docs: https://github.com/charmbracelet/crush/blob/main/docs/config/README.md
- Config skill (UI options list): https://github.com/charmbracelet/crush/blob/main/internal/skills/builtin/crush-config/SKILL.md
- Open request: https://github.com/charmbracelet/crush/issues/2648

**Net:** OpenCode's V2 slot API makes the version-in-footer plugin possible; Claude Code ships the capability natively via its statusLine payload; Crush has neither (and an open ask for it).

---

## Publish-vs-not considerations

**For publishing:**
- The niche is verified empty (no footer-version plugin found anywhere) and the premise is verified in source (session footer has no version; home footer's version is width-gated).
- The mechanism (`append` to `prompt.footer.status` with `context.app.version`) is the maintainer-endorsed surface per the #18969 closure.
- The distribution path is mature: npm + `./tui` export, or discovery directories for no-install sharing; awesome-opencode and the official ecosystem page accept PRs.
- Comparable micro-plugins (quota statuslines, quotes plugin) demonstrate the pattern works and gets catalogued.

**Risks / caveats:**
- **PR #52764** would add a built-in `statusline` command whose payload includes `version` — if merged, the plugin's job becomes a one-line shell script for anyone who adopts that feature. It is unmerged; until it lands, the plugin is the zero-config option. Worth noting in the README either way.
- Slot shape and `context.app.version` are current as of V2 (installed harness 2.0.27); upstream is actively iterating on footer surfaces, so minor API drift is possible.
- Absence of an upstream *version-display* request means there is no existing thread to piggyback on — if the goal includes upstream adoption, the plugin README (or a new issue) would have to make the case from scratch; the demand signals above are about statusline/footer customization generally, not the version specifically.
