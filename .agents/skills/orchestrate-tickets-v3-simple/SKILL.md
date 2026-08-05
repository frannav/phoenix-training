---
name: orchestrate-tickets-v3-simple
description: >-
  Analyze an arbitrary objective, delegate implementation or exploration to
  supervised Pi workers, review their results in Codex, launch bounded repairs,
  and split large objectives into dependency-aware parallel work. Use only when
  explicitly invoked as $orchestrate-tickets-v3-simple; it works from the
  current worktree, uses temporary isolated worktrees for parallel writers,
  supports selectable Pi models and role profiles, and does not invoke the
  repository's Matt Pocock engineering skills.
---

# Orchestrate Tasks v3 Simple

Turn a user objective into a small supervised workflow. Codex is the
coordinator and final reviewer; Pi performs the delegated work. This skill is
not a ticket tracker, does not require `.scratch` issues, stores optional run
state under `.orchestration/`, and does not invoke
`$implement-worker`, `$tdd`, `$code-review`, or `$setup-matt-pocock-skills`.

Use the repository's `AGENTS.md`, coding guidance, domain vocabulary, and
validation commands when they are relevant. Avoid importing a workflow just
because it exists as a project skill.

## Invocation and defaults

Accept a natural-language objective. Optional preferences may be written in
the prompt:

```text
$orchestrate-tickets-v3-simple
Objetivo: añade exportación CSV para los pedidos
Modelo: nan/deepseek-v4-flash-0731
Rol: auto
Máximo de reparaciones: 4
Paralelismo máximo: 2
```

Defaults:

- `role`: `auto`;
- `model`: `nan/deepseek-v4-flash-0731`, after availability validation;
- `max_repairs`: 4 per work node;
- `max_parallel`: 2 workers;
- integration target: the invoking worktree and branch;
- run state: `.orchestration/runs/<run-id>/` in the invoking repository;
- one worker for a small, coherent objective;
- an in-memory dependency graph for a large but sufficiently clear objective.

Allow an explicit model override only after checking it with `pi --list-models`.
Use the provider/model identifier exactly as returned by Pi. Do not silently
substitute a different model.

## Invariants

- Trigger only on an explicit `$orchestrate-tickets-v3-simple` invocation.
- Capture the invoking branch, `HEAD`, absolute path, and clean status before
  dispatch. Stop before mutation when pre-existing changes make the review
  boundary ambiguous.
- Treat the invoking worktree as the integration target. Never reset, clean,
  rebase, force-push, merge to another branch, or alter unrelated changes.
- Only one writer may use the invoking worktree at a time. Any parallel Pi
  that can write uses a temporary Orca-managed worktree based on the current
  integration SHA.
- Codex owns acceptance, validation, review, integration, graph advancement,
  and the final outcome. A Pi message or idle terminal is not approval.
- A node unlocks dependants only after its changes pass review and are
  integrated into the invoking worktree.
- Use at most `max_repairs` fresh repair workers per node. A review repair is
  distinct from an operational dispatch retry.
- Keep all Orca state resumable. Reconcile returned IDs before retrying a
  failed or interrupted mutation; never create a duplicate object blindly.
- Store visual and recovery state only under `.orchestration/`; keep it out of
  commits and never treat it as product code or a planning specification.
- Do not invoke the nested ticket skills or create ticket files as part of this
  workflow.

## 1. Analyze and classify

Summarize the objective, not hidden chain-of-thought, as an execution packet:

- desired outcome and explicit constraints;
- observable acceptance criteria;
- likely code or artifact surface;
- validation commands and a tight feedback loop when applicable;
- selected role and Pi model;
- whether the objective is small, graph-shaped, or too ambiguous to execute.

Read only the relevant repository guidance and source. For a bug, prefer the
`diagnose` role and establish a red-capable reproduction before theorizing. For
an architectural uncertainty, use `design` before `implement`. For a visual or
state-model question, use `prototype`. See [roles.md](references/roles.md).

If acceptance criteria, scope, or the required output cannot be made concrete,
ask the user before launching a worker. If a large objective has a clear graph,
show a compact breakdown and ask for confirmation only when the breakdown adds
material scope or changes the requested deliverable; do not ask for approval of
each individual node.

For a graph, make every node a complete, independently verifiable vertical
slice where possible. Record dependencies, likely ownership surface, review
criteria, and validation command in memory. Do not persist a planning file.

## 2. Preflight and runtime

Run the read-only checkpoint with `rtk`:

```bash
rtk pwd
rtk git branch --show-current
rtk git rev-parse HEAD
rtk git status --short
```

Resolve the Orca executable with the version-matched `orca-cli` and
`orchestration` guides. Confirm the runtime is available before creating a Run
or worker. Read [runtime-contract.md](references/runtime-contract.md) before
the first mutation.

Validate the selected model and retain the exact provider/model pair. Discover
the repository's typecheck, focused-test, full-suite, build, or prototype
commands only as relevant to the packet. A missing command is a limitation to
report, not a reason to invent a replacement.

Create one Run for the objective. Use one coordinator-owned parent Task for a
single-node objective or one parent Task per graph node. Do not dispatch a
parent Task in place of its worker attempt. Use fresh child attempts for
implementation and each repair.

Before the first mutation, create `.orchestration/runs/<run-id>/` and write:

- `state.json` for the latest graph projection;
- `events.ndjson` for append-only lifecycle events;
- `index.html` when visual mode is enabled;
- `server.json` when a live visualizer is running.

Add `.orchestration/` to the local Git exclude configuration when it is not
already ignored. If the repository policy forbids that change, use the
temporary directory fallback described in [runtime-contract.md](references/runtime-contract.md)
and report it. The state directory is advisory: Orca remains the source of
truth during recovery.

## 3. Dispatch the ready frontier

For a single production node (`implement`, `bugfix`, `diagnose`, or
`refactor`), dispatch one worker in the invoking worktree after the
checkpoint. A `prototype`, `research`, or `design` node that creates an
artifact or report uses a temporary isolated worktree even when it is the only
node; `plan` is coordinator-only. For a graph, find nodes with all dependencies
approved and launch up to `max_parallel`, subject to the rules in
[parallel-work.md](references/parallel-work.md).

The Pi brief must contain the objective, role, acceptance criteria, fixed point,
worktree path, allowed scope, validation commands, and required report fields.
It must tell Pi to:

- inspect relevant code and project guidance;
- implement or produce the requested artifact;
- avoid unrelated changes and secrets;
- run proportionate checks;
- commit production changes when the role calls for them;
- send exactly one explicit `worker_done` result with status, commit(s), files,
  commands, and limitations;
- never invoke this skill recursively or the repository's Matt Pocock workflow.

Use Orca's injected dispatch operation and its blocking event flow. Process
every `worker_done`, `question`, and `escalation`. Answer only questions settled
by the execution packet; ask the user about scope, domain, or integration
decisions.

## 4. Review in Codex

After a successful worker result:

1. Inspect the worktree status and the diff from the node's fixed point.
2. Verify authored paths, commit identity, and absence of unrelated edits.
3. Run the packet's focused checks and typecheck; run the full suite when the
   repository makes it reasonably available or the risk warrants it.
4. Review behavior against every acceptance criterion, regressions, scope,
   error handling, security implications, and relevant local standards.
5. Emit one of `APPROVED` or `REPAIR REQUIRED` with exact file/hunk evidence
   and command output for every blocking finding.

For `prototype`, review whether the artifact answers the stated question and
is runnable; do not apply production-quality expectations to throwaway code.
For `research`, review source quality, traceability, and whether the report
answers the question. For `design`, compare alternatives before selecting an
implementation direction. For `diagnose`, require the original repro or
feedback loop to pass and a regression guard when a suitable seam exists.

## 5. Repair and advance

On `REPAIR REQUIRED`, create a fresh Pi repair attempt with the original
objective and fixed point plus every blocking finding. The repair worker must
address all findings without silently expanding scope. Re-run the complete
Codex review after each repair. Count only review-rejected repairs against the
four-attempt budget.

On `APPROVED`:

- for a worker in the invoking worktree, record the accepted commit(s);
- for a temporary parallel worktree, integrate the accepted commit into the
  invoking worktree one at a time and run integration validation;
- only then mark the node complete and unlock its dependants;
- reconcile and clean a temporary worktree only when it is clean, integrated,
  and the version-matched Orca guide permits it. If cleanup is unavailable,
  leave it intact and report it.

If integration conflicts, a node becomes operationally blocked. Do not resolve
conflicts by resetting or guessing. Preserve the worktrees and ask whether to
resolve them manually or launch a dedicated repair attempt with the conflict
context.

When all graph nodes are approved and integrated, report the objective, node
outcomes, model and role used, commits, validation, review findings, repair
counts, retained worktrees, and the final invoking-worktree status. Never infer
success from elapsed time, a dispatched state, or an idle terminal.

If the user requests a visual map, update the state projection after each
dispatch, delivery, review, repair, integration, and unlock event. Use the
live local visualizer when requested; otherwise leave the final `index.html`
snapshot in the run directory. The visualizer is read-only and must never be
the mechanism that advances a node.
