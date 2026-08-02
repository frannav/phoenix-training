# Worker brief templates

Use these templates as Orca Task specs. Replace every angle-bracket placeholder
before dispatch. Keep the injected Orca lifecycle preamble intact.

## Implementation worker

```text
Implement <ticket-path> against <spec-path>.

Fixed point: <ticket-base-sha>
Approved public test seams:
<seam-list>
Attempt report: <attempt-report-path>

Read and obey AGENTS.md, the domain docs and relevant ADRs. Explicitly use the
loaded `$implement` skill. Apply the loaded `$tdd` skill at every approved seam in
vertical red -> green slices; run focused tests and typechecking regularly. Run
the repository's full test suite once at the end.

Invoke another project skill when its trigger matches the ticket, especially
`diagnosing-bugs` for a reported failure and `codebase-design` for a module seam.
Use the loaded `$code-review` skill as far as this Pi runtime supports it. If the
runtime cannot create its required parallel review sub-agents, perform both axes
as a self-review and report that limitation; the coordinator owns the definitive
two-axis review.

Preserve pre-existing work and stage only paths and hunks you authored. On success,
commit the ticket on the current branch and include its identity in the message.
On failure, preserve useful partial work in a clearly labelled attempt commit or
report that no commit exists; never leave ticket-owned edits uncommitted.

Write the detailed attempt report at the supplied path. Include the commit SHA
when one exists, authored paths, red/green evidence per seam, focused checks,
final full-suite result, self-review findings, and anything left. If the report
is inside the repo, include it in the same commit and authored-path list.

Send worker_done exactly once with an explicit succeeded or failed outcome, a
concise summary, `--files-modified` for the authored paths, and `--report-path`
for the attempt report. End your turn after worker_done even when the outcome is
failed.

Repository commands:
<typecheck-test-and-build-commands>
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

Read and obey AGENTS.md, the ticket, feature spec, domain docs and relevant ADRs.
Explicitly use the loaded `$implement` skill. Fix every blocking finding without
expanding ticket scope. Use the loaded `$tdd` skill for behavior changes at the
approved seams; request a coordinator decision before introducing a new seam.

Run focused tests and typechecking regularly, then the full suite once. Apply the
loaded `$code-review` skill as far as this Pi runtime supports it and report any
parallel-subagent limitation.

Preserve pre-existing work and stage only paths and hunks you authored. On success,
commit the repair separately on the current branch and include the ticket identity
in the message. On failure, preserve useful partial work in a clearly labelled
attempt commit or report that no commit exists; never leave ticket-owned edits
uncommitted.

Write the detailed attempt report at the supplied path. Include the commit SHA
when one exists, authored paths, resolution of each finding, focused checks,
final full-suite result, self-review findings, and anything left. If the report
is inside the repo, include it in the same commit and authored-path list.

Send worker_done exactly once with an explicit succeeded or failed outcome, a
concise summary, `--files-modified` for the authored paths, and `--report-path`
for the attempt report. End your turn after worker_done even when the outcome is
failed.

Repository commands:
<typecheck-test-and-build-commands>
```
