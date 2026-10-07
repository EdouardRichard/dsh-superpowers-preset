---
name: using-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions
---

<IF-YOU-ARE-A-SUBAGENT>
If you were dispatched as a subagent to execute a specific task: follow the
skills that apply to the task you were given — an implementer uses
test-driven-development, a reviewer uses the review template it was handed.
Skip the conversation-level parts of this skill: do not re-open brainstorming,
do not dispatch your own subagents, and do not ask the user clarifying
questions unless your task explicitly says to. Report evidence, not conclusions.
</IF-YOU-ARE-A-SUBAGENT>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If it turns out wrong for the situation, you don't have to use it.

**Before entering plan mode:** if you haven't already brainstormed, invoke the brainstorming skill first.

Then announce "Using [skill] to [purpose]" and follow the skill exactly. If it has a checklist, create a todo per item.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, etc.) carry it out. Brainstorming and systematic-debugging are Superpowers' most common process skills, but the rule holds for any of them.

- "Let's build X" → brainstorming first, then implementation skills.
- "Fix this bug" → systematic-debugging first, then domain skills.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Platform Adaptation

This is the DeepSeek Harness (DSH) port, mounted by the `superpowers` agent
preset. The platform reference is `references/dsh-tools.md`: the Claude Code →
DSH tool mapping, the DSH capabilities these skills use (`skill`, `subagent` /
`subagent_fork`, `workflow`, `goal`, `todo_write`), the bundled-script rules,
and the Windows `pwsh` notes. Read it before acting on any instruction below
that names a tool this harness does not have.

These rules are active only in a task started with the `superpowers` preset.
Do not assume they apply in Standard, PTC, Minimal, or Creator mode.

## User Instructions

User instructions (`AGENTS.md` — user level at `$DSH_HOME/AGENTS.md`, project level at `<project>/AGENTS.md` — and direct requests) take precedence over skills, which in turn override default behavior. Only skip skill workflows or instructions when your human partner has explicitly told you to.
