---
name: orchestrate-tickets
description: Supervise implementation of an ordered ticket queue with Pi workers pinned to DeepSeek, a GPT-5.6-sol xhigh two-axis review gate, and automatic repair loops. Use when the user asks to implement one or more ready-for-agent tickets through Orca while retaining final approval in the coordinating Codex session.
---

# Orchestrate Tickets

Implement tickets one at a time on the current branch. Delegate edits to fresh Pi
workers, retain review authority in the invoking Codex session, and advance the
queue only after the current ticket passes both review axes.

## 1. Establish the contract

Require the invoking coordinator to run as `gpt-5.6-sol` with `xhigh` reasoning.
This skill cannot change its own model or effort. When runtime metadata cannot
prove them, state the assumption before launching workers.

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

Record the queue, dependency order, and one or more public test seams per ticket.
Present the seams as a single approval gate before dispatching the first worker.
Treat seams already stated by the user or ticket as pre-approved. Ask again only
when a review finding requires a new seam.

Completion criterion: every queued ticket has a resolved dependency order and an
approved public seam.

## 2. Preflight the runtime and branch

Use the `orchestration` skill and load its version-matched guide with the resolved
Orca executable before running Orca commands. Confirm the runtime with
`rtk orca status --json`.

Confirm the worker model resolves exactly:

```bash
rtk pi --list-models deepseek-v4-flash-0731
```

Require the row `nan / deepseek-v4-flash-0731`. Use this exact Pi command for
every implementation and repair terminal:

```bash
rtk proxy pi --approve --model nan/deepseek-v4-flash-0731 \
  --skill .agents/skills/implement \
  --skill .agents/skills/tdd \
  --skill .agents/skills/code-review
```

Verify that all three skill directories exist. Capture `git status --short` and
the current `HEAD`. Preserve unrelated changes and require workers to stage only
paths and hunks they own. When an existing change overlaps a ticket's expected
surface, pause that ticket and ask the user how to separate ownership.

Use the current worktree and process tickets sequentially. Create separate
worktrees only when the user requests parallel isolation and the selected tickets
have independent dependency, file, migration, and generated-artifact surfaces.

Create one Orca Run for the queue. Before dispatching each ticket, capture its
fixed point with `git rev-parse HEAD`; retain that SHA through all repair attempts
for that ticket.

Completion criterion: Orca is ready, the exact Pi model and skills resolve, file
ownership is safe, and the Run plus ticket fixed point exist.

## 3. Dispatch an implementation worker

Read [worker-prompts.md](references/worker-prompts.md) completely before the first
dispatch. Fill the implementation template with the ticket, spec, fixed point,
approved seams, and repository commands.

Create an Orca Task with the filled brief. Because `worker-start --agent pi` does
not express custom Pi model arguments, create a fresh Pi terminal in the current
worktree with the exact command from preflight, wait for `tui-idle`, then attach
the Task using `orca orchestration dispatch --inject`.

Start only one editing worker in the current worktree. Wait through Orca Delivery
batches for `worker_done`, `escalation`, or `question`; process every message and
acknowledge each Delivery before waiting again. A timeout is a liveness checkpoint.

Accept worker completion only when it reports:

- the commit SHA and the paths it authored;
- the red/green cycles used at every approved seam, or why TDD was inapplicable;
- focused tests and typechecks run during implementation;
- the final full-suite result;
- the self-review result and any limitation of Pi's review runtime.

Inspect the commit and working tree. Reject completion evidence that includes
unrelated user changes or leaves ticket-owned edits uncommitted.

Completion criterion: one implementation commit exists and its evidence accounts
for every approved seam, validation command, and authored path.

## 4. Run the coordinator review gate

Run the repository's typecheck and full test suite from the coordinator session.
Then use the `code-review` skill against the ticket fixed point, with the ticket
and feature spec as the spec source. Run its Standards and Spec sub-agents in
parallel and aggregate them in this `gpt-5.6-sol xhigh` coordinator.

Approve only when both axes pass:

- **Standards:** no documented-standard violation and no material baseline smell;
- **Spec:** no missing, partial, incorrect, or out-of-scope behavior;
- **Validation:** coordinator typecheck and full suite pass.

Treat a baseline smell as material when it increases defect risk or makes the
ticket materially harder to change; record minor judgement calls as non-blocking
notes. State the gate as `APPROVED` or `REPAIR REQUIRED` with exact file/hunk,
requirement or rule, and failing command evidence.

Completion criterion: both review axes and coordinator validation have an explicit
verdict with actionable evidence.

## 5. Repair until approved

On `REPAIR REQUIRED`, create a new Orca Task and a fresh Pi terminal using the
same pinned model and skills. Fill the repair template with all blocking findings,
failed commands, the original ticket fixed point, and the same approved seams.
Dispatch it as a new supervised worker; do not edit the repair in the coordinator.

Require the repair worker to commit only its fixes, run focused checks while
working, run the full suite once at the end, and report `worker_done`. Re-run the
entire coordinator review gate against the original ticket fixed point.

Launch up to three automatic repair workers per ticket. After the third rejected
repair, preserve all commits and review evidence, mark the ticket blocked in the
Orca Run, and ask the user for a decision. Orca's own three-failure circuit breaker
remains authoritative when it fires earlier.

Completion criterion: the ticket is `APPROVED`, or three repair attempts have
produced a documented escalation.

## 6. Advance and report

Advance to the next unblocked ticket only after approval. Keep each ticket's
commits separate so review and rollback boundaries remain visible.

At the end, report each ticket's implementation and repair commits, validation
commands, Standards and Spec verdicts, repair count, and any blocked remainder.
Report the queue as complete only when every selected ticket is approved.
