# Parallel work and dependency graphs

Use this reference when Codex determines that one objective contains more than
one independently verifiable node.

The graph state is persisted, when enabled, under
`.orchestration/runs/<run-id>/`. Keep visual state separate from the worktree
contents being implemented; worker branches must not commit or reset it.

## Node shape

Keep the graph in memory. Each node has:

```text
id, title, role, objective, acceptance criteria,
depends_on, likely surface, fixed point, model,
validation commands, status, attempts, commits
```

Prefer vertical slices that produce a complete, testable behavior. Avoid
horizontal splits such as “backend only” and “frontend only” unless each is a
real independently verifiable contract. A dependency means the later node
cannot be reviewed or integrated safely until the earlier node is approved and
integrated.

## Frontier scheduler

Use these states:

```text
PLANNED → READY → RUNNING → REVIEWING → INTEGRATED
                                      ↘ REPAIRING → REVIEWING
```

At each scheduler turn:

1. Find `PLANNED` nodes whose dependencies are `INTEGRATED`.
2. Mark them `READY` and compare their likely surfaces pairwise.
3. Launch no more than `max_parallel` nodes, default 2.
4. Do not launch nodes that edit the same files, migration, public contract,
   aggregate, or shared test seam.
5. Review each completion independently. An approved worker is not integrated
   until its commit is applied to the invoking worktree and integration checks
   pass.
6. Mark integrated nodes complete, then recompute the frontier. Independent
   siblings may continue while a different node is repairing or blocked.

If targeted evidence cannot prove independence, run the nodes sequentially.
Conservative sequencing is preferable to a merge conflict or a misleading
green result.

## Current integration and temporary worktrees

The invoking worktree is the only integration target. It must remain clean at
the start of the workflow and between integration operations.

- A single small writer may work directly there.
- Every parallel writer receives a temporary Orca-managed worktree created from
  the current integration SHA, with a unique branch/display name.
- Read-only design and research workers may still use isolated worktrees when
  they need to create artifacts or reports.
- Dependent nodes start from the newly integrated SHA, not from a stale sibling
  base.
- Integrate approved commits one at a time, in deterministic node order, then
  run the relevant integration checks.
- If a cherry-pick or equivalent integration operation conflicts, stop that
  node. Preserve all worktrees and do not reset, clean, or invent a resolution.

Do not run two writers in the same worktree. Separate files are not sufficient:
Git's index, generated files, package managers, and shared validation state can
still collide.

## Replanning

When a worker reveals a new dependency or a materially larger scope:

- do not silently add unrelated nodes;
- pause only the affected branch of the graph;
- record the new fact in the coordinator's packet;
- ask the user if the new work changes the promised deliverable;
- otherwise add the smallest necessary node and make its dependency explicit.

If the graph cannot be made concrete, switch to `plan` and stop before
production mutation.
