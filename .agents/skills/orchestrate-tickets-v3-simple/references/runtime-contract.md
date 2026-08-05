# Simple Orca/Pi runtime contract

Use this reference after the read-only analysis and before the first Orca
mutation. The installed Orca binary is authoritative: resolve it once with the
`orca-cli` guide, load the version-matched `orca-cli` and `orchestration`
guides, and use their exact command names and flags for the remainder of the
run.

## Run-state directory

Keep the coordinator's persistent run state in the invoking repository:

```text
.orchestration/runs/<run-id>/
├── state.json
├── events.ndjson
├── index.html
└── server.json
```

Create the directory only after the read-only checkpoint and once the Orca Run
ID is known. Ensure `.orchestration/` is covered by the local Git exclude
configuration before workers start. Do not add it to commits or ask workers to
edit it. If local Git metadata cannot be changed, use
`/private/tmp/orchestration/<repo>/<run-id>/` instead.

`state.json` is a current projection and `events.ndjson` is an append-only
history. Both help resume and visualize a run, but Orca's IDs and live state
override stale or incomplete files.

## Model and worker command

Validate the requested model first:

```bash
rtk pi --list-models <model-or-filter>
```

Require an exact available provider/model row. The worker command has no
repository engineering skills attached:

```bash
rtk proxy script -q /dev/null pi --approve --model <provider>/<model>
```

Keep the pseudo-TTY wrapper. Do not replace it with a normal pipe or shell.
Do not add `$implement-worker`, `$tdd`, `$code-review`, or another Matt Pocock
skill to the command.

## Orca lifecycle

Use the guide's documented operations to:

1. verify runtime status;
2. create or reuse the single Run;
3. create the parent and fresh attempt Tasks;
4. create or reuse a current-worktree or temporary-worktree terminal;
5. wait for `tui-idle` before dispatch;
6. dispatch with the injected lifecycle operation;
7. wait with the blocking orchestration check for `worker_done`, `question`,
   or `escalation`;
8. acknowledge deliveries exactly once as the guide requires.

Do not substitute frequent polling, ordinary terminal prompts, raw Git
worktrees, or shell background jobs for the guide's operations.

## Identity ledger

Retain this tuple for every attempt:

```text
(node, role, model, Run ID, parent Task ID, attempt Task ID,
 terminal handle, worktree ID/path, branch, fixed point, commit(s), outcome)
```

If a create call returns but a later read is delayed or fails, inventory and
match the object by exact node, repository, path, branch, and fixed point before
retrying. A dispatch response is not a worker outcome.
