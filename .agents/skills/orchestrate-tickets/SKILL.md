---
name: orchestrate-tickets
description: Supervise implementation of an ordered ready-for-agent ticket queue through Orca with Pi workers pinned to DeepSeek, a coordinator-owned two-axis review gate, and bounded repair loops. Use only when explicitly invoked as $orchestrate-tickets; the invoking session is the coordinator and retains final approval.
---

# Orchestrate Tickets

Run the selected tickets in dependency order, one editing worker at a time. The
invoking session is the coordinator: workers edit and commit, but the
coordinator owns validation, review, queue advancement, and final approval.

## Operating invariants

- Work in the current worktree. Preserve unrelated changes and pause when an
  existing change overlaps the ticket's expected surface.
- Create one Orca Run, one coordinator-owned parent Task per ticket, and one
  child Task per worker attempt. Never dispatch a parent Task.
- Capture a ticket's fixed point before its first child. Review every attempt
  against that fixed point and keep ticket commits separate.
- Use the exact worker runtime in [runtime-contract.md](references/runtime-contract.md).
- Workers stage and commit only what they own, including their attempt report.
  The coordinator independently inspects the commit and working tree.
- A ticket passes only when coordinator validation and both review axes pass.
- Allow at most three review-rejected repairs after the initial implementation.
  Operational dispatch failures use Orca's circuit breaker and do not consume
  the repair budget.

## 1. Select the queue

Accept one of these inputs:

- **Explicit ticket:** select that ticket plus the transitive unresolved
  `Blocked by` closure. Read the ticket, its feature `spec.md`, direct
  dependency issues, and only the relevant domain/ADR sections.
- **Feature directory:** discover implementation tickets under
  `.scratch/<feature>/issues/`, select `ready-for-agent` tickets, and order them
  topologically by `Blocked by`.
- **Ordered queue:** validate the supplied order against `Blocked by`; reject an
  unresolved dependency or use the dependency order when the supplied order is
  incomplete.

For a feature or queue input, also read the issue-tracker and triage-label docs,
the selected tickets and spec, relevant context docs, and relevant ADRs. Do not
scan unrelated tickets, history, or the whole repository. Follow ticket links
to research or domain documents only when an acceptance criterion needs them.

Record, for every selected ticket:

- dependency parents and the queue position;
- one or more public test seams;
- the repository typecheck and full-suite commands.

Seams already stated by the user or ticket are accepted without another approval
round. Ask only when a seam is missing or ambiguous, or when a review finding
requires a new seam. Do not dispatch until the queue, dependencies, seams, and
validation commands are resolved.

## 2. Preflight once

Use the `orchestration` skill to resolve the Orca executable and load the
version-matched guide exactly once. Use the guide's documented `skills get`
command (normally `<resolved-executable> skills get orchestration`); do not
guess flags or fall back to a different executable. Confirm
`<resolved-executable> status --json` succeeds before creating Orca state.

Confirm the worker model resolves exactly:

```bash
rtk pi --list-models deepseek-v4-flash-0731
```

Require the row `nan / deepseek-v4-flash-0731`. The terminal command is fixed;
the terminal and dispatch details are in [runtime-contract.md](references/runtime-contract.md).

In one preflight pass:

- verify the `implement`, `tdd`, and `code-review` skill directories;
- capture `git status --short` and `git rev-parse HEAD`;
- read the root `package.json` to locate validation scripts, inspecting deeper
  manifests only when those scripts are absent or insufficient.

Before a ticket's first attempt, capture its fixed point and run typecheck plus
the full suite there. A failing baseline blocks dispatch; isolate unrelated
work or ask the user for a scope decision. When the preceding ticket was just
approved and no external change occurred, its coordinator validation may serve
as the next baseline instead of being rerun.

After preflight succeeds, create the single Run and the parent Task DAG in
dependency order. Record each ticket's fixed point immediately before its
first child is dispatched. Stop preflight at this point; extra confidence scans
are outside the contract.

## 3. Process each ticket

Use this state machine for every parent Task:

```text
READY -> IMPLEMENTING -> REVIEWING -> APPROVED
                           |    ^
                           v    |
                         REPAIR
                           |
                  (third rejection) -> BLOCKED
```

### Attempt

Immediately before the first dispatch, read
[worker-prompts.md](references/worker-prompts.md). Fill the implementation or
repair template with the ticket, spec, fixed point, approved seams, repository
commands, and a durable report path:

```text
.scratch/<feature>/orchestration/<ticket-number>/attempt-<n>.md
```

Create a fresh terminal and child Task as described by the runtime contract.
Run only one editing worker in the current worktree. Process every Orca
Delivery batch, acknowledge each Delivery, and continue until `worker_done`,
`escalation`, or `question` is handled.

Accept a succeeded attempt only when its report and message identify the commit,
authored paths, seam-by-seam TDD evidence or an exception, focused checks, final
full-suite result, self-review, and runtime limitations. Inspect the commit and
working tree; reject unrelated changes or uncommitted ticket-owned edits.

Treat a failed outcome as an operational failure, not a review rejection. Inspect
partial work before retrying. Retry with a fresh terminal on the same child Task
when the runtime contract permits it; escalate when its circuit breaker fires.

### Review

From the coordinator session:

1. Run typecheck and the full suite.
2. Run `code-review` with the ticket fixed point and feature spec explicitly
   supplied as its spec source. Keep its Standards and Spec axes separate.
3. Emit one gate with `APPROVED` or `REPAIR REQUIRED`. Every blocking finding
   must cite an exact file/hunk, requirement or rule, and command evidence.

Approve only when all three conditions hold:

- **Standards:** no documented-standard violation or material baseline smell;
- **Spec:** no missing, partial, incorrect, or out-of-scope behavior;
- **Validation:** coordinator typecheck and full suite pass.

Minor smell judgements are non-blocking notes. Workflow-only attempt reports do
not count as product-scope behavior in the Spec axis.

### Approval or repair

On `APPROVED`, update only the parent Task to `completed`. Store a structured
result containing the fixed point, accepted child and Dispatch IDs, all
implementation/repair commits, validation commands, both review verdicts, and
the repair count. Do not manually complete a child Task after a valid
`worker_done`.

On `REPAIR REQUIRED`, create a fresh repair child Task and terminal. Keep the
original fixed point and seams, include every blocking finding and failed
command, and rerun the complete coordinator review after the repair.

After the third review-rejected repair, preserve all commits and evidence,
mark the parent `blocked`, create a decision gate, and ask the user how to
proceed. Advance only to a parent made ready by completed dependency parents;
use the version-matched `task-list --ready` flow as queue state.

## 4. Finish

Report each ticket's implementation and repair commits, validation commands,
Standards and Spec verdicts, repair count, and blocked remainder. Call the queue
complete only when every selected parent is approved.
