# Prior Art: OpenCode status-footer and sidebar/panel plugins

Researched 2026-10-12 against primary sources (GitHub API, npm registry, official docs, upstream source). Every claim carries its source URL. Companion to [prior-art.md](prior-art.md) (footer version plugin); this file covers the vault/VPN/CI/git status lanes and the sidebar/panel surface.

## Verdict (summary)

- **Vault and VPN lanes are empty.** No OpenCode plugin anywhere renders vault lock state (Bitwarden/1Password) or VPN/network reachability. The only Bitwarden/1Password integrations are auth/secret-*injection* tools, not status displays.
- **CI pipeline status has exactly one plugin — and it is not a footer.** `opencode-gh-ci` polls `gh run list` and renders GitHub Actions status in the sidebar. No GitLab CI, no footer rendering, and no upstream demand thread asking for CI status in the TUI.
- **Git/MR state is the contested lane.** Partial overlaps exist (an opt-in branch row, a file-tree sidebar with Git status indicators, working-tree diff stats, PR-list plugins), and upstream PR #54677 (open, 2026-10-12) would add a *built-in* Git working-tree section to the sidebar — the single biggest collision risk for that lane.
- **The strongest single piece of statusline prior art is `rashidrazak/opencode-status-line`** (★30, MIT): a configurable multi-segment footer row (context, cache, speed, cost, elapsed, uncommitted changes) — but it has no vault, VPN, or CI segments.
- **The panel/sidebar surface is real and sanctioned.** Plugin-owned `session.panel` shipped (PR #47150, merged 2026-09-04), and `sidebar.content`/`sidebar.footer` slots are the maintainer-endorsed surface (per the #5971 closure). Todos lived in the sidebar through V1 and were dropped in V2 2.0.24; restoration is still open (#42421).
- **Name collisions are significant:** 4 of 7 candidate names (`opencode-hud`, `opencode-vitals`, `opencode-triage`, `opencode-sentinel`) are taken on npm; the remaining three are free on npm but all have GitHub near-collisions.
- **Recommendation: publish** — with the git-status lane framed as differentiated from PR #54677 (or dropped if it merges) and the name chosen from the npm-free set.

---

## 1. Status-footer prior art, lane by lane

Swept: GitHub topic `opencode-plugin` (1,153 repos; first 100 captured with stars/descriptions), npm registry searches across 12 queries (`statusline`, `status`, `footer`, `vault`, `bitwarden`, `pipeline`, `ci status`, `merge request`, `git status`, `sidebar`, `panel`, `todo`), the `awesome-opencode` curated list (223 entries), and the official OpenCode ecosystem page (its Plugins table, captured 2026-10-12, contains no vault/VPN/CI-status or panel-style plugins — note the page is curated and shifts; prior-art.md recorded `opencode-statusline` joining it via docs PR, and it is absent from today's table).

Sources:
- GitHub topic sweep (1,153 results): https://api.github.com/search/repositories?q=topic:opencode-plugin
- npm search: https://registry.npmjs.org/-/v1/search?text=opencode%20plugin
- awesome-opencode list: https://github.com/awesome-opencode/awesome-opencode
- official ecosystem page: https://opencode.ai/docs/ecosystem

### Vault lock state — nothing found

No OpenCode plugin renders vault lock state (Bitwarden, 1Password, or any secret manager). npm queries for `vault` and `bitwarden` return only auth/secret-*injection* integrations — tools that fetch secrets for the agent at startup, not status displays that report whether a vault is locked. The topic sweep and the awesome-opencode list surface the same category only.

Sources:
- npm search (vault): https://registry.npmjs.org/-/v1/search?text=opencode%20vault
- npm search (bitwarden): https://registry.npmjs.org/-/v1/search?text=opencode%20bitwarden
- GitHub topic sweep: https://api.github.com/search/repositories?q=topic:opencode-plugin
- awesome-opencode: https://github.com/awesome-opencode/awesome-opencode

### VPN / network reachability — nothing found

No plugin renders VPN or network-reachability state in the TUI. No network-status plugin of any kind surfaced in the topic sweep, the 223-entry awesome list, npm `status`/`footer` queries, or the official ecosystem page. This lane has no adjacent prior art at all.

Sources: same sweep surfaces as above, plus https://opencode.ai/docs/ecosystem

### CI pipeline status — one plugin, GitHub Actions only, sidebar not footer

**opencode-gh-ci** — `antoinejeannot/opencode-gh-ci`, 4 stars, no license (verified live 2026-10-12). GitHub Actions CI status rendered *in the sidebar*: a server component polls `gh run list` and exposes run status to a TUI panel. The only CI-status plugin found in any sweep. It stops at: GitHub Actions only (no GitLab CI), sidebar rendering only (no footer/statusline segment), and a poll-loop design rather than event-driven slots.

Sources:
- https://github.com/antoinejeannot/opencode-gh-ci
- npm search (ci status): https://registry.npmjs.org/-/v1/search?text=opencode%20ci

Upstream demand: none — no issue or PR in anomalyco/opencode asks for CI-pipeline status in the TUI (see section 3).

### Git / MR state — several partial overlaps, one live upstream collision

**opencode-dir-tree-tui** — `aihaipeng/opencode-dir-tree-tui`, 44 stars, MIT. "A file tree sidebar for OpenCode with **Git status indicators**, custom ignore rules, path copying, and quick file and folder opening." The largest Git-status overlap in the ecosystem; it is a file-tree panel, not a footer segment.
- https://github.com/aihaipeng/opencode-dir-tree-tui

**oc-flight-deck** — `nathwn12/oc-flight-deck`, 0 stars, MIT. "Live session telemetry in your OpenCode sidebar" — includes an opt-in `branch` row plus a `sidebar.footer.go` panel. Branch display only; no working-tree state, no MR status.
- https://github.com/nathwn12/oc-flight-deck

**opencode-git-stats** — in the `navbytes/opencode-plugins` monorepo (4 stars, MIT). Working-tree diff stats plus PR chips.
- https://github.com/navbytes/opencode-plugins

**opencode-prs** — in the `vvo/opencode-plugins` monorepo (1 star, MIT). Lists PRs referenced by the current session.
- https://github.com/vvo/opencode-plugins

**opencode-gitlab-plugin** — npm v3.0.1, source hosted on gitlab.com (not GitHub). "GitLab tools plugin for OpenCode - provides GitLab API access for merge requests, issues, pipelines, and more" — agent *tool access*, not a TUI status display.
- https://www.npmjs.com/package/opencode-gitlab-plugin
- https://gitlab.com/vglafirov/opencode-gitlab-plugin

**Upstream PR #54677 (OPEN, 2026-10-12)** — "feat(tui): show git working tree status in session sidebar". A port of the closed PR #53300; adds a *built-in* Git section to the sidebar's `sidebar.content`. **If merged, upstream covers working-tree status natively** and a plugin-owned git segment becomes redundant. Adjacent closed PR #41725 ("git branch status indicator").
- https://github.com/anomalyco/opencode/pull/54677
- https://github.com/anomalyco/opencode/pull/53300
- https://github.com/anomalyco/opencode/pull/41725

Also verified in source: the built-in sidebar footer *already* shows `cwd:branch` (see section 2 verification) — a branch segment duplicates upstream; working-tree state is the differentiated part.

### Combined multi-segment statuslines — the strongest single prior art

**opencode-status-line** — `rashidrazak/opencode-status-line`, 30 stars, MIT, pushed 2026-10-12 (actively maintained). "A live status line for OpenCode v2's terminal UI — context window, cache, streaming speed, cost, elapsed time and uncommitted changes in one configurable row." V2-native, configured via `cli.json`. The closest *pattern* match for a combined HUD: its `uncommitted changes` segment overlaps the git lane; it has no vault, VPN, or CI segments.
- https://github.com/rashidrazak/opencode-status-line

**Cockpit Status** — `@opencode-cockpit/status` (full write-up in prior-art.md §1): declarative statusline segments including a `command` (shell output) segment, so vault/VPN/CI checks *could* be piped through it — but no built-in segments exist for those lanes, and Cockpit is a heavy dependency versus a micro-plugin.
- See prior-art.md section 1: https://github.com/Codestz/opencode-cockpit

**opencode-status-bar** — `AzYuJie/opencode-status-bar`, 1 star, MIT. "OpenCode TUI plugin — sidebar status bar with time, battery, and API balance display." The closest "system status" prior art (battery is a machine-status lane like VPN), but it stops at time/battery/balance.
- https://github.com/AzYuJie/opencode-status-bar

**opencode-status-tracker** — `LINoone516/opencode-status-tracker`, 1 star, MIT. "Real-time status bar plugin for OpenCode: cache hit rate, token usage, cost, latency and model info in the sidebar footer."
- https://github.com/LINoone516/opencode-status-tracker

**opencode-status-indicator** — `harshithmohan/opencode-status-indicator`, 0 stars, MIT. "Shows, inline in the prompt footer, whether the active request is still prefilling or already decoding" — a prompt-footer status plugin (request phase, not machine status).
- https://github.com/harshithmohan/opencode-status-indicator

**Secondary candidates** (captured from npm/GitHub descriptions during the sweep, not individually deep-verified): `@npv12/opencode-footer` v1.0.0 ("active subagents and shells count in the prompt footer", no repo link), `ranjithrajv/opencode-usage-quota-tracker` (AGPL-3.0, Go-plan quota in the sidebar footer), and the subagent statusline family documented in prior-art.md §1 (★230).
- https://www.npmjs.com/package/@npv12/opencode-footer
- https://github.com/ranjithrajv/opencode-usage-quota-tracker

**Net:** no plugin combines vault, VPN, CI, and git status; every existing statusline stops at token/cost/quota/git-diff lanes. The git lane carries real overlap pressure (rashidrazak's uncommitted-changes segment, the dir-tree sidebar's Git indicators, PR #54677); vault and VPN carry none.

## 2. Sidebar and panel prior art

### The plugin-owned panel API already exists (`session.panel`)

**PR #47150 (MERGED, 2026-09-04)** — "add plugin-owned session panels". The `session.panel` API shipped: a plugin can own a session panel without touching sidebar slots.

Open follow-ons:
- PR #47152 (open): render diffs in panel slots — https://github.com/anomalyco/opencode/pull/47152
- #48519 (open): bug report — session.panel hides the sidebar — https://github.com/anomalyco/opencode/issues/48519

Sources:
- https://github.com/anomalyco/opencode/pull/47150

### The sidebar slot surface is maintainer-endorsed

**#5971 (closed completed 2026-10-01; opened 2025-12-22; 13 comments)** — "Plugin API for custom sidebar panels". The origin issue for exactly this surface; its motivation notes the sidebar was "entirely controlled by OpenCode internals (MCPs, context usage, todos, etc.)". The maintainer closure (neriousy) points V2 plugins at the `sidebar.content` / `sidebar.footer` slots — added in commit 44cd984589 and expanded in #41189. The thread carries multiple independent commenters (fatihdogmus, mathisdev7, art-shen, spde) — organic multi-user demand for the sidebar surface.

Sources:
- https://github.com/anomalyco/opencode/issues/5971
- Slot commit: https://github.com/anomalyco/opencode/commit/44cd984589

### Todo plugins — the closest "restore a lost sidebar feature" precedent

**opencode-todolist** — `aiev/opencode-todolist`, 6 stars, MIT, default branch `master` (the README 404s at `main`). "OpenCode V2 plugin restoring session todo list tools (todowrite/todoread)" that shipped with OpenCode V1, plus a sidebar todo strip "styled like the V1 sidebar todo list".
- https://github.com/aiev/opencode-todolist

**opencode-todo-plugin** — npm v1.0.3 (published 2026-10-02), no linked repository. "Adds todowrite/todoread tools and shows the session's todos in the sidebar."
- https://www.npmjs.com/package/opencode-todo-plugin

**opencode-todo-progress** — `satas20/opencode-todo-progress`, 5 stars, MIT. "Persistent todo progress bar for the opencode TUI — shows ▓▓▓▓▓▓▓▓░░ 3/10 next to the model name."
- https://github.com/satas20/opencode-todo-progress

These matter as precedent: three independent plugins restoring or re-showing a sidebar feature that upstream dropped — evidence that "the TUI dropped it, a plugin re-adds it" is a working, catalogued pattern.

### Other panel / sidebar plugins

- **opencodeDockerPlugin** — `victor-ochenin/opencodeDockerPlugin`, 1 star, MIT. "Docker panel for the OpenCode 2 TUI sidebar. Click a container to start, stop, restart or tear down its compose project, or read its logs…" — the richest third-party panel example; listed in the ecosystem page via upstream docs PRs.
  - https://github.com/victor-ochenin/opencodeDockerPlugin
  - Ecosystem-list PRs: https://github.com/anomalyco/opencode/pull/54445 · https://github.com/anomalyco/opencode/pull/54443
- **opencode-panel-apps** — `alxark/opencode-panel-apps`, 0 stars, MIT. "Small plugin to render app results in opencode panel."
  - https://github.com/alxark/opencode-panel-apps
- **opencode-extended-sidebar** — `pleware/opencode-extended-sidebar`, 2 stars, MIT. "OpenCode TUI sidebar: session switcher, live tool activity and file diffs (read-only)."
  - https://github.com/pleware/opencode-extended-sidebar
- **@opencode-cockpit/shell** and **@opencode-cockpit/review** — the Cockpit bundle's shell-output and review bays (see prior-art.md §1).
- **opencode-skills-tui** — `aihaipeng/opencode-skills-tui`, 37 stars. "A skills sidebar for OpenCode with load status tracking, SKILL.md previews, token estimates, and skill mentions in prompts."
  - https://github.com/aihaipeng/opencode-skills-tui

### Verifying the built-in sidebar in upstream source

- **Route file:** `packages/tui/src/routes/session/sidebar.tsx` renders the panel title, a scrollbox bound to the `sidebar.content` slot, and a `sidebar.footer` slot — nothing else.
  https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/routes/session/sidebar.tsx
- **Built-in feature plugins** live in `packages/tui/src/feature-plugins/sidebar/`:
  - `context.tsx` — `opencode.sidebar.context` (tokens, %, cost): https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/feature-plugins/sidebar/context.tsx
  - `mcp.tsx` — `opencode.sidebar.mcp` (MCP server list): https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/feature-plugins/sidebar/mcp.tsx
  - `footer.tsx` — `opencode.sidebar.footer` (onboarding card plus `cwd:branch` via `context.data.location.vcs.info(...)?.branch.current`): https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/feature-plugins/sidebar/footer.tsx
- **No todo, LSP, or modified-files section exists in the current dev tree** (full recursive check of `packages/tui/src`).

So the built-in sidebar today = title + Context block + MCP list + onboarding card + `cwd:branch`, plus plugin contributions through exactly two slots (`sidebar.content`, `sidebar.footer`).

### Sidebar history: todos and LSP were there, and were dropped

- **V1 sidebar included todos and LSP sections.** #5971's motivation (Dec 2025) lists "MCPs, context usage, todos, etc." as internals that controlled the sidebar; #48355 (open, 2026-09-10) refers to the sidebar "like MCP/TODO/LSP".
  - https://github.com/anomalyco/opencode/issues/5971
  - https://github.com/anomalyco/opencode/issues/48355
- **V2 dropped them.** #53587 (closed as duplicate, 2026-10-07): "v2: the todowrite tool and its task list were dropped without a replacement" — filed against V2 2.0.24; the only trace of the task list is in the V1→V2 migration path.
  - https://github.com/anomalyco/opencode/issues/53587
- **Restoration is still open:** #42421 (open, reopened 2026-08-13): "add todo support for v2".
  - https://github.com/anomalyco/opencode/issues/42421
- Caveat: #51535 / #53198 (open) describe reordering/hiding sidebar sections named Context/MCP/LSP/Todo/Modified files — sections that no longer exist in the current dev tree; their version targets could not be fully pinned (see section 3).

## 3. Upstream demand in anomalyco/opencode

Repo location and org transfer (`sst/opencode` → `anomalyco/opencode`, 212k stars, default branch `dev`) are already verified in prior-art.md §3 and are not re-derived here. The table below covers sidebar/panel/todo/git-sidebar demand found in this pass; the five footer-lane demand items documented in prior-art.md §3 are cross-referenced at the end.

| Item | State | What it asks |
| --- | --- | --- |
| [#5971](https://github.com/anomalyco/opencode/issues/5971) | closed **completed** (2026-10-01; opened 2025-12-22, 13 comments) | "Plugin API for custom sidebar panels" — the origin issue; closed by pointing at the `sidebar.content`/`sidebar.footer` slots |
| [#42421](https://github.com/anomalyco/opencode/issues/42421) | **OPEN** (reopened 2026-08-13) | "add todo support for v2" — the canonical open ask to restore the dropped task list |
| [#53587](https://github.com/anomalyco/opencode/issues/53587) | closed as duplicate (2026-10-07) | "v2: the todowrite tool and its task list were dropped without a replacement" (V2 2.0.24) |
| [#48355](https://github.com/anomalyco/opencode/issues/48355) | **OPEN** (2026-09-10) | sidebar parity — "like MCP/TODO/LSP" |
| [PR #47150](https://github.com/anomalyco/opencode/pull/47150) | **MERGED** (2026-09-04) | "add plugin-owned session panels" — the `session.panel` API shipped |
| [PR #47152](https://github.com/anomalyco/opencode/pull/47152) | OPEN PR | render diffs in panel slots |
| [#48519](https://github.com/anomalyco/opencode/issues/48519) | **OPEN** | bug: `session.panel` hides the sidebar |
| [PR #54677](https://github.com/anomalyco/opencode/pull/54677) | **OPEN PR** (2026-10-12) | "feat(tui): show git working tree status in session sidebar" — built-in Git section; port of closed PR #53300 |
| [PR #53300](https://github.com/anomalyco/opencode/pull/53300) | closed (unmerged) | predecessor of #54677 (same working-tree-in-sidebar feature) |
| [PR #41725](https://github.com/anomalyco/opencode/pull/41725) | closed | "git branch status indicator" PR |
| [#36625](https://github.com/anomalyco/opencode/issues/36625) | closed not_planned | status bar / sidebar indicators API ask |
| [#41249](https://github.com/anomalyco/opencode/issues/41249) | **OPEN** (8 comments) | "Live Subagents" sidebar section |
| [#51535](https://github.com/anomalyco/opencode/issues/51535) · [#53198](https://github.com/anomalyco/opencode/issues/53198) | **OPEN** | reorder/hide sidebar sections via tui.json (describes Context/MCP/LSP/Todo/Modified files sections) |
| [#53200](https://github.com/anomalyco/opencode/issues/53200) | **OPEN** | compact the built-in Context block |
| [#53193](https://github.com/anomalyco/opencode/issues/53193) | **OPEN** | pin the session title in the sidebar |
| [#35513](https://github.com/anomalyco/opencode/issues/35513) | **OPEN** | sidebar width control |
| [PR #53663](https://github.com/anomalyco/opencode/pull/53663) | closed | sidebar `session_id` PR (unmerged) |
| [#50606](https://github.com/anomalyco/opencode/issues/50606) | **OPEN** | "Control Hub" layout (consolidated panels) |
| [#48882](https://github.com/anomalyco/opencode/issues/48882) | **OPEN** (27 comments) | restore the legacy persistent left sidebar |
| [#51396](https://github.com/anomalyco/opencode/issues/51396) | **OPEN** | OpenChamber todo panel renders empty |
| [#53258](https://github.com/anomalyco/opencode/issues/53258) | **OPEN** | todo counts in the UI |

Closed not_planned / duplicate noise (for completeness): #52931, #38081, #38082, #54138 (V1 1.18.35), #54553, #51336; closed PRs #33409, #33410, #32962, #33116 (June 2026 — a todo panel existed in the sidebar at that point), #46109; closed completed #26914, #17492; open #48956 (captured during the sweep, details not recorded).

**Footer-lane demand stands as documented in prior-art.md §3** and is not re-derived: #37464 (open, custom statusLine via shell command), PR #52764 (open, implements it; payload includes `version`), #18969 (closed completed 2026-10-01 — the maintainer-endorsed footer-slot quote), #42929 (open, context-window limit in footer *and* sidebar), #46268 (open, per-assistant-message footer slot).

### Explicit absence — what I could NOT find

- **No vault or VPN plugin anywhere.** No plugin renders vault lock state or VPN/network reachability (verified across npm, GitHub topic, awesome list, and the ecosystem page — see section 1).
- **No CI-status demand upstream.** No issue or PR in anomalyco/opencode asks for CI-pipeline status in the TUI.
- **No MR/review-status demand upstream.** No issue or PR asks for MR/pull-request status in the TUI. The closest signals are community plugins (`opencode-prs`, `opencode-git-stats`, `@opencode-cockpit/review`) and closed PR #51130 ("local pr-footer plugin showing open PR number", documented in prior-art.md §3).
- **Dev-sidebar section removal not pinned to a commit.** #53587 pins V2 2.0.24 as the release where todowrite/the task list were dropped, but the exact code change that removed the Todo/LSP/Modified-files sidebar sections was not traced to a commit or PR.
- **Version targets not pinned for #51535 / #53198 / #53200 / #53258.** These describe sidebar sections (Todo/LSP/Modified files) that no longer exist in the current dev tree; which V2 release each was filed against was not verified.
- **`aiev/opencode-todolist` README at `main` 404s** — the default branch is `master`; the README was fetched from there.

## 4. Name collision check

Checked 2026-10-12 against the npm registry and GitHub. **4 of 7 candidate names are taken on npm; all 7 have at least one GitHub near-collision.**

| Name | npm | GitHub | Nearest collision |
| --- | --- | --- | --- |
| `opencode-hud` | **taken** (`opencode-hud` 0.1.6) | **crowded** | Two-Weeks-Team/opencode-status-hud (★7), Alaye-Dong/opencode-hud (★4), ndom91/opencode-hud (★4), hoshinodis/opencode-hud (★0), scoped `@ndom91/opencode-hud` / `@stalfh/opencode-hud`, plus `@banburist/opencode-engine-hud` |
| `opencode-vitals` | **taken** (0.2.0) | taken-ish | moutazideal/opencode-vitals (★0), skatkov/opencode-vitals-terminal (★0) |
| `opencode-preflight` | **free** (unscoped) | near-collision | `@arthurhuang09/opencode-preflight` on npm + arthurhuang09/opencode-preflight repo (★0) |
| `opencode-triage` | **taken** (1.3.4 — a skill router) | taken | cascharly/opencode-triage (★10) |
| `opencode-sidecar` | **free** | near-collision | vrybas/opencode-sidecar (★0, no description) |
| `opencode-sentinel` | **taken** (0.1.5 — a monitor plugin) | taken-ish | tsukimiya/opencode-sentinel (★0), bytesemantics/opencode-sentinel-npm (★2) |
| `opencode-watchtower` | **free** | near-collision | awdemos/opencode-watchtower (★5) |

Reading: `opencode-preflight`, `opencode-sidecar`, and `opencode-watchtower` are the only npm-free names, and each carries a GitHub squatter — none is fully clean. A fresh coinage, or a scoped npm name in the established `@scope/opencode-*` convention, sidesteps most of the contention.

---

## Publish-vs-not considerations

**For publishing:**
- Vault and VPN lanes are verified empty across every sweep surface — a plugin owning them has no competition at all.
- CI has exactly one plugin, with a different rendering model (sidebar poll loop, GitHub Actions only) — a footer segment, an event-driven design, or GitLab CI support still fills a gap.
- The sanctioned surfaces are verified and current: `sidebar.content`/`sidebar.footer` slots (maintainer-endorsed per the #5971 closure, 2026-10-01) and plugin-owned `session.panel` (shipped via merged PR #47150).
- The "restore what the TUI dropped" pattern has working precedent: three independent todo plugins re-add a dropped sidebar feature, and comparable micro-plugins get catalogued (awesome-opencode, 223 entries; official ecosystem page accepts PRs).
- Distribution path is mature — npm + `./tui` export, or discovery directories for zero-install sharing (documented in prior-art.md §2).

**Risks / caveats:**
- **PR #54677 (open, 2026-10-12) is the single biggest collision risk for the git lane**: it would add a built-in Git working-tree section to the sidebar. Unmerged today; if it lands, a plugin's git segment becomes redundant and the README should say so. The built-in sidebar footer already shows `cwd:branch`, so branch display is upstream's — working-tree state is the differentiated part.
- **Name choice is constrained**: 4 of 7 candidate names are taken on npm, and the npm-free three all have GitHub squatters (section 4). Coining a fresh name or using a scope is safer than contending.
- **Known panel bug**: #48519 (open) reports `session.panel` hiding the sidebar — relevant if the plugin uses panels; the two sidebar slots avoid it.
- **API drift**: upstream is actively iterating on sidebar surfaces (#51535/#53198 reorder/hide via tui.json, #53200, #54677). Slot shapes are current as of the installed harness (2.0.27), but minor drift is possible.
- **No upstream demand thread for vault/VPN/CI status**: unlike the footer lanes (which have #37464/#18969 to piggyback on), these lanes have no existing issue to reference — a README or upstream issue would have to make the case from scratch. That cuts both ways: no demand signal, but also no competing expectation.
