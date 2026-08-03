---
name: implement-worker
description: "Implement a piece of work as a supervised worker based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly and focused test files regularly. The coordinator
owns the complete validation; this worker does not require the full test suite.

Once done, use /code-review to review the work as far as the runtime supports
it and report any limitations; the coordinator owns the definitive review.

Commit your work to the current branch.
