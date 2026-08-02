---
name: orchestrate-tickets
description: Supervise implementation of an ordered ready-for-agent ticket queue through Orca with Pi workers pinned to DeepSeek, a GPT-5.6-sol xhigh two-axis review gate, and bounded repair loops. Use only when explicitly invoked as $orchestrate-tickets and the coordinating Codex session must retain final approval.
---

# Orchestrate Tickets

Implement tickets one at a time on the current branch. Delegate edits to fresh Pi
workers, retain review authority in the invoking Codex session, and advance the
queue only after the current ticket passes both review axes.

## 1. Establish the contract

Require the invoking coordinator to run as `gpt-5.6-sol`.
This skill cannot change its own model or effort. When runtime metadata cannot
prove both values, stop before creating Orca state and ask the user to restart
with the required runtime or explicitly relax the requirement for this run.

Accept explicit ticket paths or an ordered queue. When given a feature directory,
discover implementation tickets under `.scratch/<feature>/issues/`, then order
them by their `Blocked by` relationships. Select only tickets marked
`ready-for-agent`; consider a blocker satisfied only when its implementation is
already present on the branch or it passed this workflow earlier in the same run.

Read these before planning the queue:

- `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`
- the feature `spec.md` and every selected ticket
- `CONTEXT.md` or the relevant entries from `CONTEXT-MAP.md`
- relevant ADRs under `docs/adr/` and context-local `docs/adr/` directories

Record the queue, dependency graph, and one or more public test seams per ticket.
Present the seams as a single approval gate before dispatching the first worker.
Treat seams already stated by the user or ticket as pre-approved. Ask again only
when a review finding requires a new seam.

Completion criterion: every queued ticket has a resolved dependency graph and an
approved public seam.

## 2. Preflight the runtime and branch

Use the `orchestration` skill to resolve the Orca executable once. Load the full,
version-matched guide with `<resolved-executable> skills get orchestration --full`
before any other Orca command. Apply the repository's `rtk` rule and reuse that
exact resolved executable for every later call; never fall back to bare `orca`.
Confirm `status --json` succeeds and exposes the current orchestration capability.

Confirm the worker model resolves exactly:

```bash
rtk pi --list-models deepseek-v4-flash-0731
```

Require the row `nan / deepseek-v4-flash-0731`. Pass this exact command as the
`--command` payload when creating every implementation and repair terminal:

```bash
rtk proxy script -q /dev/null pi --approve --model nan/deepseek-v4-flash-0731 \
  --skill .agents/skills/implement \
  --skill .agents/skills/tdd \
  --skill .agents/skills/code-review
```

Keep the `script -q /dev/null` pseudo-TTY wrapper. A bare `rtk proxy pi ...`
leaves Pi's stdout as a pipe under `terminal create`; Pi then detects
non-interactive mode, exits successfully, and leaves a normal shell. Redirecting
to `/dev/tty` is not a substitute for the wrapper.

Verify that all three skill directories exist. Capture `git status --short`, the
current `HEAD`, and the repository validation commands. Preserve unrelated changes
and require workers to stage only paths and hunks they own. When an existing change
overlaps a ticket's expected surface, pause that ticket and ask the user how to
separate ownership.

Before each ticket, run the coordinator typecheck and full test suite at its fixed
point and record the results as the baseline. Do not dispatch against a failing
baseline: determine whether unrelated work caused it, then isolate the work or ask
the user for a scope decision. Never ask a ticket worker to repair baseline failures.

Use the current worktree and process tickets sequentially. Create another worktree
only when the user requests it or a concrete checkout/filesystem conflict makes
sharing unsafe. Require independent dependency, file, migration, and generated-
artifact surfaces before running workers in parallel.

Create one Orca Run for the queue with `run-create` and retain its ID. In dependency
order, create one coordinator-owned parent Task per ticket and encode `Blocked by`
with `--deps` pointing to the corresponding parent Task IDs. Never dispatch a parent
Task: its status is the ticket's approval state. Child Tasks represent worker
attempts and may complete before the parent does.

Before dispatching a ticket's first child Task, capture its fixed point with
`git rev-parse HEAD`; retain that SHA through every implementation and repair
attempt for that ticket.

Completion criterion: Orca is ready, the exact Pi model and skills resolve, the
baseline is recorded, file ownership is safe, and the Run, ticket DAG, and fixed
point exist.

## 3. Dispatch an implementation worker

Read [worker-prompts.md](references/worker-prompts.md) completely before the first
dispatch. Fill the implementation template with the ticket, spec, fixed point,
approved seams, attempt report path, and repository commands. Use a durable path
under `.scratch/<feature>/orchestration/<ticket-number>/attempt-<n>.md`; treat the
report as worker-authored evidence, commit it with the attempt, and exclude that
workflow-only path from product-scope findings in the Spec review axis.

Confirm the ticket parent Task is ready, then create a child Task beneath it with
the filled brief. Because `worker-start --agent pi` does not express custom Pi
model arguments, create a fresh Pi terminal in the current worktree with the exact
command from preflight. Require `terminal wait --for tui-idle` to report
`satisfied` before attaching the child Task with the version-matched
`orchestration dispatch --inject` command. Retain the child Task and Dispatch IDs.
If the wait times out, Pi exits with code 0, or the terminal shows a shell prompt,
do not dispatch: inspect the terminal output, verify the pseudo-TTY wrapper and
exact model and skill arguments, then recreate a fresh terminal.

Start only one editing worker in the current worktree. Wait through Orca Delivery
batches for `worker_done`, `escalation`, or `question`; process every message and
acknowledge each Delivery before waiting again. A timeout is a liveness checkpoint.

Require `worker_done` exactly once with an explicit succeeded or failed outcome.
Accept a succeeded attempt for review only when its concise message and referenced
attempt report account for:

- the commit SHA and the paths it authored;
- the red/green cycles used at every approved seam, or why TDD was inapplicable;
- focused tests and typechecks run during implementation;
- the final full-suite result;
- the self-review result and any limitation of Pi's review runtime.

Inspect the commit and working tree. Reject completion evidence that includes
unrelated user changes or leaves ticket-owned edits uncommitted.

Treat a failed outcome as an operational attempt failure, not a review rejection.
Inspect its Dispatch and account for any partial commit or owned working-tree
changes before transferring ownership. When retry is appropriate, create a fresh
custom Pi terminal and use the version-matched `worker-start --retry-of <dispatch>`
flow with that terminal so the retry remains on the same child Task and Orca's
per-Task circuit breaker remains meaningful. Escalate when the circuit breaker
fires.

Completion criterion: one succeeded implementation child Task and commit exist,
and their evidence accounts for every approved seam, validation command, and
authored path.

## 4. Run the coordinator review gate

Run the repository's typecheck and full test suite from the coordinator session.
Then use the `code-review` skill against the ticket fixed point, with the ticket
and feature spec as the spec source. Run its Standards and Spec sub-agents in
parallel and aggregate them in this `gpt-5.6-sol`  coordinator.

Approve only when both axes pass:

- **Standards:** no documented-standard violation and no material baseline smell;
- **Spec:** no missing, partial, incorrect, or out-of-scope behavior;
- **Validation:** coordinator typecheck and full suite pass.

Treat a baseline smell as material when it increases defect risk or makes the
ticket materially harder to change; record minor judgement calls as non-blocking
notes. State the gate as `APPROVED` or `REPAIR REQUIRED` with exact file/hunk,
requirement or rule, and failing command evidence.

On `APPROVED`, update only the coordinator-owned parent Task to `completed` and
store a structured result containing the fixed point, accepted child Task and
Dispatch IDs, implementation and repair commits, validation commands, both review
verdicts, and repair count. Do not manually complete the child Task; its valid
`worker_done` already did that.

Completion criterion: both review axes and coordinator validation have an explicit
verdict with actionable evidence.

## 5. Repair until approved

On `REPAIR REQUIRED`, increment the ticket's review-rejection count, then create a
new repair child Task and fresh Pi terminal using the same pinned model and skills.
Fill the repair template with all blocking findings, failed commands, the original
ticket fixed point, the same approved seams, and a fresh attempt report path.
Dispatch it as a new supervised worker; do not edit the repair in the coordinator.

Require the repair worker to commit only its fixes, run focused checks while
working, run the full suite once at the end, and report `worker_done`. Re-run the
entire coordinator review gate against the original ticket fixed point.

Launch up to three repair child Tasks after the initial implementation. After the
third repair is rejected by review, preserve all commits and evidence, update the
ticket parent Task to `blocked` with a structured result, create a decision gate on
that parent, and ask the user how to proceed.

Keep the two limits separate: Orca's three-failure circuit breaker covers failed
Dispatches retried on one child Task; this skill's three-repair limit covers
succeeded child Tasks that the coordinator review rejects.

Completion criterion: the ticket is `APPROVED`, three rejected repair attempts
have produced a documented decision gate, or an operational circuit breaker has
produced a documented escalation.

## 6. Advance and report

Advance only to a parent Task made ready by completion of all dependency parents.
Use the version-matched `task-list --ready` flow as external queue state, while
continuing to run only one editing worker in the current worktree. Keep each
ticket's commits separate so review and rollback boundaries remain visible.

At the end, report each ticket's implementation and repair commits, validation
commands, Standards and Spec verdicts, repair count, and any blocked remainder.
Report the queue as complete only when every selected ticket is approved.
