# Superpowers mode · mode details and how to use it

This file holds the two panels a built-in DSH preset shows on its card:
**Mode details** and **How to use**. `Superpowers` is a third-party preset, and
DSH currently ships those in-card help buttons for its four built-in presets
only (Standard, PTC, Minimal, Creator), so the content lives here. The reason,
with source references, is in
[Why the card has no such buttons](#why-the-card-has-no-such-buttons).

---

## 1. Mode details

Pick **Superpowers** when you start a new task, then say what you want to
accomplish, point at the relevant files, and explain how to check the result.
The mode applies to that task only.

### How it works

It puts the whole [obra/superpowers](https://github.com/obra/superpowers)
development methodology inside one DSH agent preset:

- **The workflow rules live in the system prompt.** The body of
  `using-superpowers` is injected as this mode's persona, so it is re-sent on
  every request and cannot be lost to context compaction or history trimming.
  That is the key difference from injecting the text once at session start.
- **The 15 skills are visible in this mode only.** A provider inside the package
  registers them into the preset's own skill layer. Tasks started in other modes
  never see them and pay no catalog tokens for them.
- **The tool set matches Standard mode.** Plan mode, subagents, workflows, goals,
  context compaction, a terminal, and file read/write/search are all mounted, so
  this mode can carry a task from idea to commit on its own.

### The five stages

| Stage | Skills | Output |
| --- | --- | --- |
| Think it through | `brainstorming` | A design or spec you approved |
| Plan it | `writing-plans` | Small independently verifiable tasks, each with its test and command |
| Execute it | `subagent-driven-development` / `executing-plans` | Each task implemented and independently reviewed, or driven from a ledger in one context |
| Debug it | `systematic-debugging` / `test-driven-development` | Root cause first, failing test first, then the fix |
| Finish it | `verification-before-completion` / `requesting-code-review` / `finishing-a-development-branch` | Evidence-backed completion claims, pre-merge review, a clean branch finish |

You do not have to use every skill. The rule is: **if a skill clearly applies,
load it before acting** — including before asking a question or reading code.

### When to choose it

- Feature work, bug fixes, and refactors — anything that ships code.
- You want the agent to stop and settle requirements and design before writing.
- The task is long enough to need a plan and a ledger, and may hit compaction.
- You want to diagnose a session that went sideways: `diagnosing-superpowers`
  reads the on-disk transcript and reports with `file:line` evidence.

### When to choose something else

- Non-coding questions, research, and plain text handling — use Standard mode
  and save the workflow tokens.
- A one-line change you do not want to run through a full process — Standard
  mode is more direct.
- A baseline for comparison — Minimal mode is the better control.

---

## 2. How to use it

Pick **Superpowers** for a new task and describe the work. You do not need to
remember skill names; the agent loads them by rule. You can also name one
directly with `/skill-name` (for example `/brainstorming`), or just ask for it
("do this with TDD").

### From idea to design

> I want to add a "export to CSV" feature to this CLI, but I have not settled the
> argument design. Talk the requirements and boundaries through with me first,
> give me two or three options to compare, and only write code after I confirm.

Expected output: a design you approved, including tradeoffs and edge cases. No
production code should change in this stage.

### Execute a feature from a plan

> Write an implementation plan for the design we just agreed on. Break it into
> small tasks I can verify one at a time, and give each task the test command to
> run. Show me the plan first.

Expected output: a plan file on disk where every task has a verification command
and a pass criterion. Then say "execute the plan".

### Fix a bug (root cause first)

> Occasionally an order gets charged twice after submit. Find the root cause
> first — do not patch yet. Once you have it, write a failing test that
> reproduces it, then fix it, run the relevant tests, and explain the cause.

Expected output: the root cause, a test that fails before and passes after, the
minimal fix, and the test output.

### Review a change

> Review the changes on this branch. Focus on potential bugs and test gaps, and
> cite file paths and line numbers. Do not modify files yet.

Expected output: review comments with `file:line` references, ordered by severity.

### Work on independent tasks in parallel

> These three modules each need a dependency upgrade and do not affect each
> other. Dispatch them in parallel, then summarize what changed per module and
> how the tests came out.

Expected output: one set of changes and test results per module, merged into a
single summary.

### Diagnose a session that went wrong

> The last session was slow and did not finish. Read its transcript and tell me
> where it actually got stuck, with evidence.

Expected output: a report with `file:line` evidence naming repeated work, an
ignored plan, or a skill that never fired.

---

## 3. Why the card has no such buttons

This is not a configuration problem; it is how DSH is built today. In-card help
is open to **built-in** presets only. Evidence from DSH `0.2.1-alpha.1`:

- `packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx:115` calls
  `presetGuide(row.id, builtIn ? 'system' : 'user')`, and `:142-147` renders the
  two buttons only when that lookup returns something.
- `PresetGuideDialog.tsx:19-24` is a hardcoded map of four preset ids, and
  `:32-34` returns `undefined` for any `trust !== 'system'`.
- `agent-preset-registry/src/display.ts:53-55` defines `isBuiltInPreset` as "the
  row publishes **no** `name` and its id is one of those same four".

So a third-party preset's card shows **View configuration** only, and no plugin
can add the other two: `ui-agent-preset` registers its `settings.section`
without a child slot, and a profile patch may override a row's `config`,
`disabled`, `inject`, `intercept`, and `isolate` — never repoint it at another
module.

**This repository therefore ships that content as the document you are
reading.** If you want first-class help for third-party presets, a feature
request on the DSH repository is the right channel; until then, this
`docs/guide.en.md` is the equivalent of "Mode details / How to use".

---

## 4. See also

- [Architecture](architecture.md) — how this preset is assembled and how the
  isolation works.
- [Compared with the plugin approach](plugin-vs-preset.md) — the tradeoffs.
- [README](../README.en.md) — install, upgrade, uninstall, customise.
