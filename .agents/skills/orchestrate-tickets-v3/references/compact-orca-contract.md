# Compact Orca contract

Use this reference only after user approval and after the version-matched Orca
guides have been loaded once. It describes how to reduce round trips without
weakening identity or recovery checks.

## Compact output

Prefer JSON output piped through a selector that retains only IDs, names,
handles, paths, branches, base SHAs, states, and error codes. Do not put full
Run, Task, worktree, terminal, or dispatch payloads into coordinator context.
Keep the raw response available to the current command or terminal for
reconciliation, but summarize it as one line per object.

The direct JSON response from a mutation is the first readback. A phase-level
inventory is the second readback. Do not issue `list`, `show`, `list`, `show`
after every independent object unless the direct response is missing an
identity needed by the next phase.

## Phase protocol

Run-dependent work is sequential only where necessary:

```text
preflight -> create/reuse Run
                         |
          +--------------+--------------+
          |                             |
   create/reuse Tasks            create/reuse worktrees
          |                             |
          +--------------+--------------+
                         |
               batch reconcile identities
                         |
                 verify branch/base/clean
                         |
          +--------------+--------------+
          |                             |
    create terminals                 reuse handles
          |                             |
          +--------------+--------------+
                         |
               wait tui-idle in parallel
                         |
               dispatch in parallel
                         |
               one post-dispatch readback
```

Tasks and worktrees are independent after the Run exists and may be launched
concurrently with separate tool calls when the harness supports it. Never
start terminals or dispatches until all approved Tasks and worktrees have
passed reconciliation.

## Identity rules

For every ticket retain this tuple:

```text
(ticket path, repo selector, worktree ID, absolute path,
 required branch, base SHA, Task ID, terminal handle, Dispatch ID)
```

The tuple is the wave ledger. A missing or conflicting member is an operational
blocker for that ticket. Never infer a worktree ID from a repository ID, a
branch from a display name, or a terminal from a stale listing.

When a create call returns but the next command fails, do not repeat create.
Run the phase inventory and match the returned object by exact repository,
display name/path, branch, and base. Reuse only a proven match.

## Worktree creation

Use the exact version-matched command documented by Orca. The usual inert
shape is:

```bash
rtk <ORCA> worktree create \
  --repo <repo-selector> \
  --name feature/ticket-<N> \
  --no-parent \
  --base-branch main \
  --setup run \
  --json
```

Use the full worktree ID returned by Orca. Check from the absolute path:

```bash
rtk git -C <worktree-path> branch --show-current
rtk git -C <worktree-path> rev-parse HEAD
rtk git -C <worktree-path> status --short
rtk git rev-parse main
```

All independent create calls may run in parallel. If any fails, do not
dispatch the successful siblings. Preserve them for recovery.

## Task and dispatch validation

Before dispatch, inspect a compact task projection and verify every spec still
contains the exact ticket path, base SHA, required branch, literal
`$orchestrate-tickets`, and literal `$orchestrate-tickets-v3`. Do not use shell
double quotes around specs containing `$`; use a shell-safe transport.

After dispatch, retain the Dispatch ID and target terminal handle. A dispatch
response is not a worker outcome. Outcomes arrive only through the blocking
orchestration check flow.
