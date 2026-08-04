# Event-driven wave monitoring

Use this reference after all outer Tasks are dispatched.

## One blocking loop

Use the version-matched command, normally:

```bash
rtk <ORCA> orchestration check \
  --wait \
  --types worker_done,escalation,question \
  --timeout-ms 900000 \
  --json
```

Do not replace it with frequent polling of terminals, Tasks, or Dispatches.
When the harness returns a liveness heartbeat or timeout without a Delivery,
re-enter the same blocking wait. Do not emit a progress message for that
heartbeat. If the harness supports keeping the command pending, prefer that
over starting a new foreground call.

## Delivery handling

For each Delivery:

1. Identify its outer Task and ticket from the wave ledger.
2. For `worker_done`, verify the outcome is the nested skill's approved or
   explicitly blocked finish and capture its compact report.
3. For `question`, answer only from the approved ticket packet and repository
   contract. If the answer changes scope, seams, domain behavior, or another
   worktree, leave it unresolved and ask the user.
4. For `escalation`, preserve the evidence and ask the user unless the
   approved packet provides an unambiguous safe resolution.
5. Acknowledge the Delivery using the guide's exact `--ack <delivery_id>` form,
   then continue blocking wait. Never acknowledge a Delivery twice.

Do not manually complete a child Task after a valid worker outcome. The nested
skill owns its inner lifecycle; the outer coordinator records the result and
completes only the outer Task when the guide permits it.

## Completion condition

The wave is complete only when every approved outer Task has one explicit
terminal outcome and every ledger tuple has been recorded. A terminal being
idle, a Dispatch being `dispatched`, a timeout, or a heartbeat is not
completion.

Keep the final report compact: one row per ticket plus a short operational
failure or blocked-remainder section. Do not paste raw delivery payloads.
