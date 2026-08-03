---
name: orchestrate-tickets-v2
description: >-
  Find the next unblocked ready-for-agent implementation tickets, recommend a
  safe parallel wave of two to five tickets, ask the user to approve the exact
  tickets, and supervise one isolated main-based worktree per approved ticket
  while launching $orchestrate-tickets inside each worktree. Use only when
  explicitly invoked as $orchestrate-tickets-v2.
---

# Orchestrate Tickets v2

Act as the outer coordinator for a parallel ticket wave. Discovery and
recommendation happen first; no worktree, terminal, task dispatch, or ticket
edit may happen before the user approves the exact wave. After approval, create
one independent worktree and branch per ticket, then run the original
`$orchestrate-tickets` skill inside each worktree.

The nested [`orchestrate-tickets`](../orchestrate-tickets/SKILL.md) skill is the
single source of truth for implementation workers, validation, review, repair,
and ticket approval. This skill does not duplicate that workflow or its worker
references; it only coordinates discovery, approval, isolation, delegation,
and wave-level reporting.

## Non-negotiable invariants

- Invoke this skill only explicitly as `$orchestrate-tickets-v2`.
- Always inspect and recommend before asking for approval. Even when the user
  names tickets in the invocation, show the recommendation and ask which
  tickets to launch.
- Do not launch a wave with fewer than two or more than five tickets. If fewer
  than two safe candidates exist, explain why and ask the user for direction;
  never invent parallelism by pairing dependent or overlapping work.
- Every selected ticket must be an implementation ticket whose tracker state is
  `ready-for-agent`, and every `Blocked by` dependency must be resolved.
- Selected tickets must be pairwise independent: neither may depend directly
  or transitively on the other, and their described ownership surfaces must not
  materially overlap.
- Every checkout must be created from the local `main` ref, with the exact
  branch `feature/ticket-<ticket-number>`. Verify both the branch and base
  commit before dispatching an agent.
- Create one top-level Orca Run for the wave, one independent worktree per
  ticket, and one outer supervised task per ticket. Do not put parallel tickets
  in a shared worktree and do not base a worktree on the invoking feature
  branch.
- Inside each worktree invoke `.agents/skills/orchestrate-tickets` (or
  `$orchestrate-tickets`) with the exact ticket path. Never invoke v2
  recursively.
- Do not merge, rebase, delete worktrees, or alter `main` unless the user
  explicitly asks for that follow-up.
- Preserve unrelated changes in the invoking worktree. The v2 coordinator
  only reads it during discovery; implementation happens in fresh checkouts.
- Treat the wave as resumable but not transactionally atomic: an interruption
  can happen between two Orca mutations. Never retry a creation blindly and
  never create a second branch for a ticket whose first checkout may already
  exist.
- Do not create an Orca Run, Task, terminal, worktree, branch, or ticket edit
  until the complete read-only preflight in section 0 has passed.
- Do not use raw `git worktree add` as a substitute for Orca worktree creation.

## 0. Safety preflight and interruption recovery

Run this phase after the user's explicit approval and before creating any
Orca state. It is deliberately read-only.

1. Resolve the Orca executable once using the `orca-cli` skill and load the
   version-matched `orca-cli` and `orchestration` guides exactly once. Confirm
   `<ORCA> status --json` reports a reachable ready runtime. `status` alone is
   insufficient: also run the guide's read-only repo and worktree discovery
   commands (`repo list` and `worktree list`/`worktree ps`) with the exact
   repository selector that will be used later.
2. If a runtime operation returns `runtime_unavailable`, stop before any
   mutation, apply the guide's documented `ORCA open --json` recovery, and
   retry the same read-only operation once. If the host exposes an approved
   sandbox/IPC escalation path, request it for the Orca runtime operation;
   never work around the failure with raw Git worktrees. If the second
   read-only check fails, report the operational blocker and ask the user to
   restore Orca; do not create a Run or Tasks.
3. Capture, in one checkpoint, `git rev-parse main`, `git status --short`, the
   invoking branch, the absolute repository path, the Orca repo selector, and
   the exact approved ticket paths. Re-read every approved ticket's status and
   blockers at this point. If `main` changed since recommendation, use the
   new SHA only after recording it in the approval checkpoint and Task specs.
4. Before creating anything, inventory partial state from an earlier or
   interrupted attempt:

   - list lightweight Runs and find any Run whose objective names exactly the
     approved ticket set;
   - list that Run's Tasks, if present;
   - list Orca worktrees and `git worktree list --porcelain`;
   - inspect `refs/heads/feature/ticket-<N>` for every approved ticket.

   A matching existing Run/Task/worktree may be resumed only when its ticket
   path, base SHA, required branch, and repository all match this approval.
   Reuse its full worktree id and terminal handle; do not create duplicates.
   If a branch/worktree exists without provable matching ownership, has the
   wrong base, is dirty, is checked out elsewhere, or has a conflicting
   display name, stop that ticket before mutation and report the exact
   collision. Do not delete, reset, rename, or clean it automatically.
5. Validate all approved branch names and worktree destinations as a batch
   before creating the first checkout. A collision or unavailable destination
   for any ticket blocks only that ticket, but no worker may be dispatched
   until every approved ticket has either a verified reusable checkout or a
   newly verified checkout.

After every mutating Orca command, immediately read back its JSON result and
repeat the relevant read-only inventory. If the process is interrupted after
one worktree is created, the next invocation must reconcile and reuse that
worktree; it must not create the other worktree and then pretend the wave was
atomic, and it must not issue a duplicate create for the first ticket. Leave
partial worktrees available for review and report them explicitly.

## 1. Discover and recommend a wave

Read `AGENTS.md` and these local tracker references before selecting anything:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- the root `CONTEXT.md` or `CONTEXT-MAP.md`, when present
- applicable ADRs under `docs/adr/` and context-specific ADR directories

Confirm that `main` resolves with `git rev-parse main`. Do not silently
substitute `origin/main`, the current branch, or a feature branch.

Scan `.scratch/*/issues/*.md` and build a deterministic candidate table. A
candidate is eligible only when:

1. its `Status:` line (bold Markdown is allowed) is exactly
   `ready-for-agent`;
2. it is an implementation ticket (`Type: task`, or no `Type:` line in this
   repository's established issue format), not research, prototype, grilling,
   resolved, claimed, or human-only work;
3. every numeric ticket in its `Blocked by:` line resolves to a ticket whose
   status is `resolved`; and
4. its ticket body and acceptance criteria are sufficiently specified for the
   original skill to identify public test seams and validation commands.

Resolve a numeric blocker within the same feature directory first. If the
reference is ambiguous or missing, exclude the ticket and record the reason.
Do not treat a ticket as unblocked merely because its blocker is also a
candidate in this wave.

Order candidates by ticket number, then feature directory, then path. For each
candidate, read its body, the relevant sections of its feature `spec.md`, and
the minimum domain/ADR context needed to understand its ownership surface.
Compare candidates pairwise using their acceptance criteria, domain concepts,
named modules/routes/tables, and targeted repository searches. Exclude a pair
when either ticket changes the other's prerequisite, the same aggregate/API
contract, the same migration or foundational seam, or an indistinguishable
set of files. Be conservative when the surface cannot be established.

Recommend the largest safe prefix of the ordered candidates, capped at five,
with at least two members. Include for every recommendation:

- feature and exact ticket path;
- ticket number and title;
- current status and resolved blockers;
- the likely ownership/test surface;
- why it is independent of every other recommended ticket;
- any risk or uncertainty that affected the recommendation.

If the scan finds more than five safe tickets, recommend five and list the
remaining safe candidates as the next wave. If it finds zero or one safe
ticket, do not dispatch; report the blocking reasons and ask whether the user
wants to change the ticket state/scope or run a non-parallel exception.

## 2. Ask for explicit approval

Present the recommendation before doing any Orca mutation. Ask the user in
plain language which exact tickets to launch, for example:

```text
He encontrado estos tickets seguros para una ola paralela: 15, 16 y 19.
Recomendación: lanzar 15 y 16; 19 queda fuera porque comparte la base de
datos con 15. ¿Qué conjunto de 2–5 quieres que lance?
```

The user may choose any two-to-five tickets from the eligible, pairwise-safe
set, not only the recommended prefix. Revalidate status, blockers, dependency
independence, and `git rev-parse main` after the reply. If the user names an
ineligible ticket, a blocked ticket, or an unsafe combination, explain the
exact conflict and ask again. Do not reinterpret a one-ticket answer as
approval for a parallel wave. This approval belongs to the invoking user; do
not replace it with an Orca decision gate.

## 3. Outer Orca preflight

Use the `orca-cli` and `orchestration` skills to resolve the Orca executable
and load the version-matched guides exactly once. Confirm `<resolved-executable>
status --json` succeeds and use the same executable thereafter. Do not guess
flags from an older guide.

The outer coordinator does not create Pi worker terminals, child implementation
Tasks, review gates, or repair attempts. Those belong to the nested
`$orchestrate-tickets` invocation and must remain inside its worktree.

Before creating state:

- capture `git rev-parse main` as the wave base SHA;
- capture `git status --short` for the invoking worktree;
- identify the repository selector/path used by Orca;
- ensure `.agents/skills/orchestrate-tickets/SKILL.md` exists in the base;
- ensure the approved ticket files exist at the paths recorded during
  discovery.

Do not create the Run until the read-only checks in section 0 succeed. If a
matching Run already exists from an interrupted invocation, bind to and
reconcile it instead of creating another Run. If it contains malformed or
mismatched Tasks, do not dispatch them; report the mismatch and correct only
after confirming the Run/task identity from the guide.

Create one outer Run and one independent outer Task per approved ticket. Each
Task spec must include the exact ticket path, the base SHA, the required branch,
and this worker brief:

```text
You are the isolated supervisor for <ticket-path>.

You are already in the worktree for branch feature/ticket-<N>, created from
main at <base-sha>. Invoke exactly $orchestrate-tickets for <ticket-path>.
Do not invoke $orchestrate-tickets-v2 recursively. Keep all implementation,
validation, review, repair, and commits inside this worktree. The original
skill must use the ticket path explicitly and must not process other tickets.
Do not reimplement or bypass the original skill's worker runtime, validation,
review gate, or repair budget.
Wait until its workflow is genuinely complete, then report its approved or
blocked outcome, commits, validation, and review verdicts to this outer task.
Do not merge, rebase, delete the worktree, or edit another worktree.
```

When creating Task specs through a shell, preserve the literal
`$orchestrate-tickets` and `$orchestrate-tickets-v2` tokens. Prefer a
shell-safe single-quoted argument or another transport that prevents variable
expansion; do not interpolate a JSON-escaped spec inside shell double quotes.
Before creating worktrees or dispatching, read back the Run's Tasks with the
version-matched orchestration command and verify that each spec still contains
the exact ticket path, base SHA, required branch, and both literal skill names.
If a spec is malformed, do not dispatch it; correct or replace the Task and
record the operational failure separately from any worker outcome.

Create all independent Tasks before starting any worker. Start all approved
workers in one wave; do not wait for ticket A before creating ticket B. If Task
creation succeeds but a later preflight fails, leave the Tasks untouched and
record the operational failure separately; do not dispatch a partial wave.

## 4. Create and verify each worktree

Use the version-matched Orca worktree command with these semantics for every
ticket (the exact executable and JSON shape come from the loaded guide). Prefer
the inert form without `--agent` so creating the checkout cannot start a worker
before the whole wave is verified:

```bash
<ORCA> worktree create \
  --repo <repo-selector> \
  --name feature/ticket-<N> \
  --no-parent \
  --base-branch main \
  --setup run \
  --json
```

Only use agent-first `--agent codex` creation when the version-matched guide
requires it or the user explicitly requests it. In that case the terminal is
still not dispatched: do not send a prompt, and do not assume the worktree is
valid until all branch/base/cleanliness checks below pass.

Use the full worktree id returned by Orca, never only the repository id. If an
agent-first create was required, read the agent handle from
`agentTerminalHandle`, falling back to `startupTerminal.handle` only when the
guide documents that compatibility field. Before dispatching the outer Task,
verify from the returned absolute worktree path:

```bash
git -C <worktree-path> branch --show-current
git -C <worktree-path> rev-parse HEAD
git rev-parse main
```

The first output must be exactly `feature/ticket-<N>` and the two commit SHAs
must match. Orca may normalize a slash in `--name feature/ticket-<N>` to a
hyphenated Git branch such as `feature-ticket-<N>` while retaining the requested
display name, so never infer the branch from the create response alone. If Orca
created a different branch in a completely fresh, unmodified checkout, rename
that checked-out branch to the required exact name and verify again. This is
the only automatic branch rename permitted. If the checkout is dirty, the
required branch already exists elsewhere, the base does not match, or the
create response is ambiguous, do not dispatch into it; report the
worktree-specific blocker and leave the checkout untouched.

Create and verify every approved worktree before creating any worker terminal
or dispatch. If creation of ticket A succeeds and creation of ticket B fails,
do not dispatch A and do not retry A's create command. Preserve A's verified
checkout, record the partial wave, and resume only through the reconciliation
rules in section 0 after the user or a later invocation supplies direction.

After all worktrees are verified, create exactly one Codex terminal per
worktree if the inert creation path was used. Wait for each terminal to reach
`tui-idle` with the documented timeout, then attach the outer Task using the
version-matched injected dispatch. Use the low-level `dispatch --inject` path
here because branch/base verification must happen between worktree creation
and dispatch. Do not send an ordinary prompt in place of an injected
supervised dispatch.

## 5. Supervise the wave

After all valid worktrees are dispatched, use the blocking orchestration loop:

```bash
<ORCA> orchestration check \
  --wait \
  --types worker_done,escalation,question \
  --timeout-ms 900000 \
  --json
```

Process every Delivery. Answer routine worker questions from the approved
ticket and repository contract using the least-expansive safe interpretation;
do not change the ticket scope. A question that would require a new seam,
scope decision, or conflicting domain decision is a blocker: keep unrelated
workers running and report it to the user. Acknowledge the Delivery and keep
waiting using the guide's exact `--ack <delivery_id> --wait` form. A timeout is
only a liveness checkpoint, not completion or failure.

Require one explicit `worker_done` outcome per outer Task. The outer worker is
successful only when the inner `$orchestrate-tickets` workflow has reached its
own approved or explicitly blocked finish and the report identifies the inner
commits, validation, Standards verdict, Spec verdict, and repair count.

Treat an outer operational failure separately from an inner review rejection.
Use the version-matched retry flow only when the outer worker failed before
the inner workflow made ticket-owned changes. If the inner workflow left
commits or partial work, do not automatically retry in the same branch; report
the evidence and ask for a recovery decision.

## 6. Finish and optional GitHub PRs

For each selected ticket, report:

- ticket path and branch;
- worktree path and outer Task/Dispatch identifiers;
- inner implementation and repair commits;
- validation commands and results;
- Standards and Spec review verdicts;
- whether the ticket is approved or blocked, and why.

Also report any candidate tickets deliberately left for the next wave and the
original invoking worktree's status. Leave all feature worktrees available for
review. The v2 run is complete only when every approved outer Task has reported
and every worktree outcome has been recorded.

If the user explicitly requested PR creation (for example, “create the PR
towards main with gh”), do this only after that ticket's inner workflow has
reported an approved outcome and the outer report includes its commits,
validation, Standards verdict, Spec verdict, and repair count:

1. From the ticket's verified worktree, confirm the exact branch, clean status,
   base SHA, and that the branch contains ticket-owned commits. Never create a
   PR for a blocked, rejected, partial, dirty, or ambiguous outcome.
2. Check for an existing PR for the exact head branch with `gh pr view` or the
   guide's equivalent. If none exists, create it with the GitHub CLI using the
   exact head branch and `--base main`, a ticket-specific title, and a body
   containing the ticket path, implementation commits, validation commands and
   results, Standards/Spec verdicts, and repair count. Preserve literal shell
   arguments safely; do not use an interpolated shell string that can expand
   skill tokens or credentials.
3. Read back the created PR with `gh pr view --json number,url,state,baseRefName,headRefName`
   and report its URL/number. Do not merge, close, rebase, delete the worktree,
   or alter `main` unless the user separately asks for that follow-up.

If PR creation fails after the implementation is approved, classify it as an
operational handoff failure, preserve the branch/worktree, report the exact
`gh` error, and do not retry destructively or mark the ticket blocked.
