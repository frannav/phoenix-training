---
name: orchestrate-tickets-v3
description: >-
  Find, recommend, and supervise a safe parallel wave of two to five
  ready-for-agent implementation tickets through compact, manifest-driven Orca
  operations. Use only when explicitly invoked as $orchestrate-tickets-v3; it
  preserves the approval gate, main-based isolation, nested
  $orchestrate-tickets workflow, resumability, and final coordinator control.
---

# Orchestrate Tickets v3

Coordinate a parallel wave with the smallest useful context footprint. Keep
the discovery phase read-only, ask for exact user approval, then create and
verify all Orca state in batches before dispatching any supervisor. The nested
`$orchestrate-tickets` skill remains the source of truth for implementation,
validation, review, repair, and ticket approval.

Do not add or require new fields in ticket files. Infer ownership and seams
from the existing ticket, specification, context, ADR, and targeted source
searches.

Treat the compact recommendation as an in-memory wave manifest. Carry it into
the approval checkpoint and outer Task specs; do not create a planning file or
modify the repository merely to persist discovery state before approval.

## Invariants

- Trigger only on an explicit `$orchestrate-tickets-v3` invocation.
- Recommend only implementation tickets with exact `ready-for-agent` status
  and resolved blockers.
- Launch only two to five pairwise-independent tickets. Never treat a ticket
  that is another ticket's blocker as independent.
- Preserve the invoking worktree and unrelated changes. Never alter, merge,
  rebase, delete, or clean `main` or a feature worktree.
- Every checkout is created through the version-matched Orca guide, from local
  `main`, with exact branch `feature/ticket-<N>`.
- Create one outer Run and one outer supervisor Task per approved ticket. The
  outer Task invokes exactly `$orchestrate-tickets` with the exact ticket path;
  never invoke v3 recursively.
- No worker starts until every approved ticket has a verified reusable or new
  worktree, branch, base SHA, and clean state.
- Treat each phase as resumable. Use returned IDs and reconciliation results;
  never repeat a create command merely because a later readback was delayed.
- Keep user-facing commentary to phase transitions and meaningful events. Do
  not narrate heartbeats or print complete JSON payloads.

## 1. Discovery: two passes, compact output

Start with a read-only checkpoint:

```bash
rtk pwd
rtk git rev-parse main
rtk git branch --show-current
rtk git status --short
```

Read `AGENTS.md`, `docs/agents/issue-tracker.md`,
`docs/agents/triage-labels.md`, `docs/agents/domain.md`, and the root
`CONTEXT.md` or `CONTEXT-MAP.md` only as needed. Do not print whole documents
when a targeted section is sufficient.

### Pass A: metadata

Scan only `.scratch/*/issues/*.md` paths and compact header data. Extract the
ticket number, feature, title, `Type`, `Status`, and `Blocked by`. Use one
bounded shell call and emit one short row per ticket; do not dump every issue
body. Resolve numeric blockers in the same feature directory first. If a
blocker is ambiguous or missing, exclude the ticket and record the reason.

An eligible candidate is an implementation ticket (`Type: task` or the
repository's established no-Type format), exactly `ready-for-agent`, with
every numeric blocker resolved. Do not treat another ready candidate as a
resolved blocker.

Order candidates by ticket number, feature directory, then path. If there are
no candidates, report the compact blocker table and stop.

### Pass B: targeted evidence

Read full bodies only for the ordered candidates, their unresolved blocker
headers, and the relevant sections of the feature spec. Read context or ADR
sections only for acceptance-criteria terms. Search source only for named
routes, modules, tables, aggregates, and test seams from those documents.

Do not enumerate the whole `back`, `front`, or repository tree; run global
history searches; read an entire large spec; or scan unrelated features.
Stop as soon as each candidate has:

- dependency parents and queue position;
- a likely ownership/test surface;
- one or more public test seams;
- repository typecheck, focused-test, and full-suite commands;
- enough evidence to compare it pairwise with other candidates.

Compare only plausible pairs. Exclude a pair when either ticket changes the
other, shares a migration or foundational seam, changes the same aggregate or
API contract, or has an indistinguishable file surface. Be conservative when
targeted evidence cannot establish independence.

Recommend the largest safe prefix of the ordered candidates, capped at five.
It must contain at least two tickets. Include the exact path, resolved
blockers, surface, seams, independence evidence, and uncertainty for every
recommendation. List safe candidates left for a later wave.

Then ask plainly:

```text
He encontrado una ola segura: 30, 31 y 32. ¿Qué conjunto exacto de 2–5
tickets quieres que lance?
```

Do not create a Run, Task, terminal, branch, worktree, or ticket edit before
the user approves the exact set. If fewer than two safe candidates exist,
explain the reason and ask whether the user wants to change scope or make a
non-parallel exception; do not invent parallelism.

## 2. Approval checkpoint and one-time Orca preflight

After approval, do not repeat discovery. Revalidate only the approved paths,
their status/blockers, `git rev-parse main`, invoking status, and branch or
worktree collisions. Record the base SHA used by this wave. If `main` moved,
show the new SHA and use it only after recording the change in the approval
checkpoint.

Resolve the Orca executable through `orca-cli`, load the version-matched
`orca-cli` and `orchestration` guides exactly once, and use that executable for
the whole wave. Print only the command fragments needed for status, repo,
worktree, terminal, task, dispatch, and blocking check operations. Confirm:

```bash
rtk <ORCA> status --json
rtk <ORCA> repo list --json
rtk <ORCA> worktree list --repo <repo-selector> --json
rtk <ORCA> worktree ps --json
rtk pi --list-models deepseek-v4-flash-0731
```

Require the model row `nan / deepseek-v4-flash-0731`. Verify the nested skill
exists and capture the invoking path, branch, clean status, repository
selector, exact ticket paths, and base SHA in one compact checkpoint.

Inventory interruption state before mutation:

- lightweight Runs, matching the exact approved ticket set;
- Tasks in a matching Run;
- Orca worktrees and `git worktree list --porcelain`;
- `refs/heads/feature/ticket-<N>` for every approved ticket.

Reuse an existing object only if ticket path, repository, base SHA, required
branch, and ownership all match. A dirty, ambiguous, conflicting, checked-out
elsewhere, or wrongly based object blocks that ticket; never reset, rename, or
delete it automatically. If Orca reports `runtime_unavailable`, follow the
version-matched recovery once and stop before mutation if it remains
unavailable.

Read [compact-orca-contract.md](references/compact-orca-contract.md) now for
the batched mutation and reconciliation protocol.

## 3. Batched bootstrap

Use the phases in the reference. The direct JSON returned by each mutating
command is its immediate readback; reconcile the whole independent phase once
before starting the next phase. If the version-matched Orca guide explicitly
requires a per-mutation inventory, obey that requirement. A failed command is
an operational failure, not a ticket review result.

1. Create or reuse one Run for the exact wave objective.
2. Create or reuse all outer Tasks before starting any worker. Put the compact
   approval packet in each spec: exact ticket path, base SHA, required branch,
   validated seams/commands, and this brief:

   ```text
   You are the isolated supervisor for <ticket-path>.
   You are already in feature/ticket-<N>, created from main at <base-sha>.
   Invoke exactly $orchestrate-tickets for <ticket-path>; never invoke
   $orchestrate-tickets-v3 recursively and never process another ticket.
   Keep implementation, validation, review, repair, and commits in this
   worktree. Use the supplied packet to avoid unrelated discovery, but retain
   the original skill's required baseline, worker runtime, review gate, and
   repair budget. Wait for its approved or explicitly blocked finish and report
   commits, validation, Standards/Spec verdicts, and repair count. Do not
   merge, rebase, delete the worktree, or edit another worktree.
   ```

3. Create all missing worktrees from local `main` in parallel when the guide
   permits independent Orca calls. Use parallel tool calls, not shell
   background jobs that hide returned IDs. Use the inert documented form
   unless the guide explicitly supports a safe one-step agent-first form that
   returns a terminal handle without dispatching it.
4. Verify every worktree in one batch. Check exact branch, `HEAD == base
   SHA`, clean status, full worktree ID, and destination. If Orca normalized a
   slash to a hyphenated branch in a fresh clean checkout, perform the only
   permitted automatic rename and verify again. Otherwise stop that ticket.
5. Create exactly one Codex terminal per verified worktree in parallel when
   inert creation was used. Wait for all terminals to reach `tui-idle` in
   parallel.
6. Dispatch all outer Tasks with the guide's injected dispatch operation in
   parallel. Do not use ordinary prompts in place of injected dispatch.
7. Perform one compact post-dispatch readback of all Task/Dispatch states.

At the tool layer, submit independent calls concurrently when supported (for
example, collect `Promise.all` results in one tool orchestration), then emit
one phase summary. Do not serialize each ticket behind a separate assistant
turn merely to inspect an object that has already returned its own JSON.

Do not dispatch a partial wave. If any approved ticket cannot reach a verified
checkout, preserve the valid partial state, report it, and wait for a later
reconciliation or user direction.

## 4. Supervise without heartbeat noise

Read [monitor-contract.md](references/monitor-contract.md) before the first
wait. Use the guide's blocking flow:

```bash
rtk <ORCA> orchestration check \
  --wait \
  --types worker_done,escalation,question \
  --timeout-ms 900000 \
  --json
```

Keep the wait loop event-driven. A liveness timeout or heartbeat is not a
failure and must not produce a user-facing progress paragraph. Re-enter the
same blocking flow, acknowledging a Delivery exactly as the guide specifies.
Process every `worker_done`, `question`, and `escalation`. Answer only routine
questions covered by the approved packet; escalate scope, seam, domain, or
conflicting-worktree decisions to the user while unrelated tickets continue.

Require one explicit successful or blocked outcome per outer Task. A success
requires the nested skill to have reached its own approved or explicitly
blocked finish and to report inner commits, validation, Standards verdict,
Spec verdict, and repair count. Never infer completion from elapsed time or a
terminal becoming idle.

## 5. Finish and recovery

Report one compact row per ticket with path, branch, worktree, Task/Dispatch
IDs, inner implementation/repair commits, validation results, Standards and
Spec verdicts, repair count, and approved/blocked outcome. Also report safe
candidates left for a later wave and the invoking worktree status.

Leave all feature worktrees available. Do not merge or create PRs unless the
user separately requests it; follow the existing v2 PR safety rules if asked.

For an interrupted run, reconcile the existing Run, Tasks, worktrees, branches,
and dispatches against the recorded base SHA and exact ticket paths. Resume
only matching objects. Never issue a duplicate create, dispatch a partial
wave, or retry a ticket-owned inner workflow after commits exist without a
recovery decision.
