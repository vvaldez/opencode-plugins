# Glossary

## Work-tracking todo

A user-curated item in a session's sidebar todo list. Written by the
`/todo` dialog or the `/todo-sync` skill, stored in the user-level todos
file, and rendered display-only in the session sidebar. Work-tracking
todos are never injected into agent context and never registered as
agent tools.

Distinct from an **agent todo**: the v1 `todowrite`/`todoread` tool
items that lived in agent context, removed in v2 upstream because they
slowed agents down (#42421). This plugin deliberately does not
re-register those tools.
