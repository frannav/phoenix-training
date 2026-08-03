# Orca/Pi runtime contract

Load this reference before the first worker dispatch. Use the version-matched
Orca guide for exact subcommands and flags; this file records only invariants
that the ticket workflow depends on.

## Worker command

Confirm the model first:

```bash
rtk pi --list-models deepseek-v4-flash-0731
```

Require `nan / deepseek-v4-flash-0731`, then use this exact command as the
`--command` payload for every implementation and repair terminal:

```bash
rtk proxy script -q /dev/null pi --approve --model nan/deepseek-v4-flash-0731 \
  --skill .agents/skills/implement-worker \
  --skill .agents/skills/tdd \
  --skill .agents/skills/code-review
```

Keep the `script -q /dev/null` pseudo-TTY wrapper. Without it, Pi may see a
pipe, exit successfully as non-interactive, and leave a normal shell. Redirecting
to `/dev/tty` is not a substitute.

## Dispatch lifecycle

1. Create a fresh Pi terminal in the current worktree.
2. Wait for `terminal wait --for tui-idle` to report `satisfied`.
3. If it times out, Pi exits with code 0, or a shell prompt appears, inspect
   the terminal and recreate it; do not dispatch into that terminal.
4. Create a child Task under the ticket parent and attach it with the
   version-matched `orchestration dispatch --inject` command.
5. Retain the child Task and Dispatch IDs. After dispatch, wait using:

   ```bash
   <resolved-executable> orchestration check \
     --wait \
     --types worker_done,escalation,question \
     --timeout-ms 900000 \
     --json
   ```

   Process every Delivery batch. After each Delivery, answer any question
   before acknowledging it, then acknowledge and wait again using:

   ```bash
   <resolved-executable> orchestration check \
     --ack <delivery_id> \
     --wait \
     --types worker_done,escalation,question \
     --timeout-ms 900000 \
     --json
   ```

   The 15-minute timeout is a liveness checkpoint, not an operational failure.
   Continue with rolling waits until `worker_done`, `question`, or
   `escalation`. Do not query the terminal, transcript, task list, Run status,
   or use `sleep`/short polling while Pi is working. Visible activity and
   heartbeats show that Pi is alive, not that it has finished.
6. Require exactly one `worker_done` with an explicit succeeded or failed
   outcome.

Operational failures are not review failures. When retrying, create a fresh
   custom terminal and use the version-matched
   `worker-start --retry-of <dispatch>` flow so the retry stays on the same
   child Task and Orca's per-Task circuit breaker remains meaningful. Escalate
   when that breaker fires.

The coordinator owns the parent Task status. A valid `worker_done` completes its
child; never manually complete that child during approval.
