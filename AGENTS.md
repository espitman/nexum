# Nexum Agent Rules

These rules apply to all agent work in this repository.

## Git

- Do not run Git write operations unless the user explicitly requests them.
- Do not commit unless the user explicitly asks for a commit.
- Do not push unless the user explicitly asks for a push.
- Reading Git status, logs, or diffs is allowed when needed to understand the workspace.

## Package Manager

- Use `pnpm` for package installation, scripts, workspace management, and lockfile updates.
- Do not use `npm`, `yarn`, or `bun` unless the user explicitly requests it.
