# Role profiles

Choose one profile in the execution packet. `auto` selects the narrowest
profile that fits the user's objective. Profiles change the Pi brief and
review lens; they do not bypass the coordinator's fixed point, validation, or
repair gate.

## implement

Build a production behavior from explicit acceptance criteria. Add or update
tests at public seams when they provide useful protection. Keep the change
focused and commit it.

## bugfix

Use when the failure is already understood enough to fix. Reproduce the exact
symptom, add a regression guard at the right public seam, fix the cause, and
re-run the original reproduction. If the cause is unclear, switch to
`diagnose` instead of guessing.

## diagnose

Use for hard, intermittent, performance, or poorly understood failures. Build
one tight, deterministic, red-capable feedback loop first. Minimize the
reproduction, rank falsifiable hypotheses, probe one variable at a time, and
only then produce a fix. Remove temporary instrumentation before completion.

## refactor

Preserve observable behavior. Capture a useful baseline, make a narrow
structural improvement, and run the relevant checks. Do not add speculative
features or redesign adjacent modules.

## prototype

Answer one concrete design question with throwaway work. Select the shape:

- `logic`: a tiny interactive harness for state, transitions, or data shape;
- `ui`: several radically different variants on the existing route when
  possible, switchable by a query parameter or equivalent;
- `auto`: Codex chooses `logic` or `ui` from the question.

Keep state in memory by default, skip polish and production abstractions, make
the artifact runnable with one command, and state the question it answers.
Do not integrate the prototype into the invoking worktree unless the user
explicitly asks to promote a result. Its review asks whether it answers the
question and can be driven, not whether it is production-ready.

## research

Investigate primary sources: official documentation, source code, standards,
or first-party APIs. Return a concise report with claims tied to sources and a
clear recommendation or unresolved question. Do not edit production code just
to make the research look complete.

## design

Use when the right interface, module seam, or architecture is uncertain. Keep
workers read-only and request at least two genuinely different proposals when
the question warrants it: minimal interface, flexible interface, common-case
optimized, or ports-and-adapters. Codex compares leverage, locality, seam
placement, migration risk, and testability, then chooses the direction for a
later implementation node.

## plan

Use when the objective is too large or foggy to implement safely. Codex creates
an in-memory dependency graph of decisions, research, prototypes, and tasks;
Pi may be used for bounded research or design questions, but no production
implementation starts until the graph is concrete enough and any user decision
has been obtained.

## auto-selection heuristics

- “build”, “add”, “support”, or “change behavior” → `implement`;
- “broken”, “error”, “regression”, “slow”, or “fails sometimes” → `diagnose` or
  `bugfix`, depending on whether a reproduction already exists;
- “rename”, “simplify”, “extract”, or “restructure” → `refactor`;
- “what should this look like/feel like?” → `prototype`;
- “which API/design/interface should we use?” → `design`;
- “look up”, “compare docs”, or “investigate” → `research`;
- an objective spanning several sessions or with unresolved decisions →
  `plan`.
