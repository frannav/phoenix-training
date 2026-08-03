# Worker brief templates

Use these as Orca Task specs. Replace every angle-bracket placeholder before
dispatch; paste the Shared worker contract into its placeholder. Keep Orca's
injected lifecycle preamble intact.

## Shared worker contract

Apply the loaded `$implement-worker` skill. Read `AGENTS.md`, the ticket, the feature
spec, relevant domain docs, and relevant ADRs. Use `$tdd` in vertical red ->
green slices at the approved public seams; ask the coordinator before adding a
new seam. Run typechecking and focused tests regularly. Do not require the full
suite: complete validation belongs to the coordinator. Apply `$code-review` as
far as the Pi runtime supports it and report any parallel-subagent limitation;
the coordinator owns the definitive review. Invoke another project skill when
its trigger matches the ticket, especially `diagnosing-bugs` for a reported
failure and `codebase-design` for a module seam.

Preserve pre-existing work. Stage only paths and hunks authored by this attempt.
On success, commit the implementation or repair separately on the current
branch and include the ticket identity in the commit message. On failure,
preserve useful partial work in a clearly labelled attempt commit or report
that no commit exists; never leave ticket-owned edits uncommitted.

Write the detailed report at `<attempt-report-path>`. Include the commit SHA
when one exists, authored paths, seam-by-seam TDD evidence or why TDD was
inapplicable, typecheck and focused checks, self-review findings, and anything
left. Do not claim a full-suite result unless the coordinator explicitly asked
for one. For repair attempts, also record the resolution of every finding.

Send `worker_done` exactly once with an explicit `succeeded` or `failed`
outcome, a concise summary, `--files-modified` for authored paths, and
`--report-path` for the report. End the turn after `worker_done`.

## Implementation worker

```text
Implement <ticket-path> against <spec-path>.

Fixed point: <ticket-base-sha>
Approved public test seams:
<seam-list>
Attempt report: <attempt-report-path>

<shared worker contract>

Repository commands:
<typecheck-and-focused-test-commands>
```

## Repair worker

```text
Repair the rejected implementation of <ticket-path> against <spec-path>.

Original fixed point: <ticket-base-sha>
Approved public test seams:
<seam-list>
Blocking review evidence:
<standards-spec-and-validation-findings>
Attempt report: <attempt-report-path>

<shared worker contract>

Fix every blocking finding without expanding ticket scope. Repository commands:
<typecheck-and-focused-test-commands>
```
