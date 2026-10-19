# Session todos live in a user-level file, not the host API or plugin storage

OpenCode v2 exposes no todo data to plugins and deliberately removed the
v1 todo tools because they slowed agents down (anomalyco/opencode#42421).
The feature needs three writers (the /todo dialog, the /todo-sync skill
running inside an agent session, and hand edits) and one reader (the TUI
plugin), and no in-process store can reach all of them: a skill cannot
write plugin storage, and the host API has nothing to mirror. We store
todos in `~/.config/opencode/todos.json`, keyed by sessionID, never
auto-pruned, and the plugin validates on read.

## Considered options

- Plugin storage (`context.storage.store`): dialog-only; a skill running
  in an agent session cannot write it.
- Mirror host todos: no todo API exists in v2; the v1 tools were removed
  upstream ("it slows agent down").
- Re-register the v1 tools: rejected for the same reason; this plugin
  stays display-only and injects nothing into agent context.

## Consequences

- The plugin reads one user-owned file: a new, documented trust surface
  (an allow-list read that falls back to empty on a hostile or stale
  shape).
- The /todo-sync skill and the dialog share one file; both write through
  the same schema.
- Old sessions leave orphaned lists until cleared via /todo; accepted
  for simplicity.
